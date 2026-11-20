import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- mocks: the admin check, the storage helpers and Next's cache
const requireAdmin = vi.fn();
const filesStillUsed = vi.fn();
const removeStoredFiles = vi.fn();
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/storage", () => ({
  filesStillUsed: (f: unknown) => filesStillUsed(f),
  removeStoredFiles: (f: unknown) => removeStoredFiles(f),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { deleteOrders, previewCleanup, runCleanup } = await import("./admin-storage");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

/** a tiny stand-in for the admin's Supabase client */
function fakeSupabase(opts: { orders?: unknown[]; deleted?: { id: string }[]; candidates?: unknown[] } = {}) {
  const calls: Record<string, unknown[]> = { deleteIn: [], update: [], rpc: [] };
  const sb = {
    from: () => ({
      select: () => ({ in: async () => ({ data: opts.orders ?? [], error: null }) }),
      delete: () => ({ in: (_c: string, ids: string[]) => ({ select: async () => { calls.deleteIn.push(ids); return { data: opts.deleted ?? [], error: null }; } }) }),
      update: (v: unknown) => ({ in: async (_c: string, ids: string[]) => { calls.update.push([v, ids]); return { error: null }; } }),
    }),
    rpc: async (name: string, args: unknown) => { calls.rpc.push([name, args]); return { data: opts.candidates ?? [], error: null }; },
  };
  return { sb, calls };
}

beforeEach(() => {
  requireAdmin.mockReset();
  filesStillUsed.mockReset();
  removeStoredFiles.mockReset().mockResolvedValue({ removed: 0, failed: 0 });
});

describe("deleteOrders", () => {
  it("is admin only: without an admin nothing is read, deleted or removed", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT /admin/login"));
    await expect(deleteOrders([A])).rejects.toThrow();
    expect(removeStoredFiles).not.toHaveBeenCalled();
  });

  it("deletes the orders, then removes their files except the ones another order still uses", async () => {
    const { sb, calls } = fakeSupabase({
      orders: [
        {
          id: A,
          payment_proof_path: "proofs/2026-01/a.webp",
          order_items: [
            { design_path: "uploads/2026-01/mine.png", pieces: null },
            { design_path: "uploads/2026-01/p1.png", pieces: [{ design_path: "uploads/2026-01/p1.png" }, { design_path: "uploads/2026-01/p2.png" }] },
          ],
        },
        { id: B, payment_proof_path: null, order_items: [{ design_path: "uploads/2026-01/shared.png", pieces: null }] },
      ],
      deleted: [{ id: A }, { id: B }],
    });
    requireAdmin.mockResolvedValue({ supabase: sb });
    filesStillUsed.mockResolvedValue(new Set(["uploads/2026-01/shared.png"]));
    removeStoredFiles.mockResolvedValue({ removed: 4, failed: 0 });

    const res = await deleteOrders([A, B, "not-a-uuid", A]);
    expect(calls.deleteIn).toEqual([[A, B]]); // validated and de-duplicated
    const removed = (removeStoredFiles.mock.calls[0][0] as { path: string }[]).map((f) => f.path).sort();
    expect(removed).toEqual(["proofs/2026-01/a.webp", "uploads/2026-01/mine.png", "uploads/2026-01/p1.png", "uploads/2026-01/p1.png", "uploads/2026-01/p2.png"].sort());
    expect(removed).not.toContain("uploads/2026-01/shared.png");
    expect(res).toMatchObject({ ok: true, deleted: 2, filesRemoved: 4 });
  });

  it("removes no file when nothing was deleted", async () => {
    const { sb } = fakeSupabase({ orders: [{ id: A, payment_proof_path: "proofs/x.webp", order_items: [] }], deleted: [] });
    requireAdmin.mockResolvedValue({ supabase: sb });
    const res = await deleteOrders([A]);
    expect(res.ok).toBe(false);
    expect(removeStoredFiles).not.toHaveBeenCalled();
  });

  it("rejects an empty selection", async () => {
    requireAdmin.mockResolvedValue({ supabase: fakeSupabase().sb });
    expect((await deleteOrders([])).ok).toBe(false);
  });
});

describe("cleanup", () => {
  const rows = [
    { order_id: A, bucket: "designs", path: "uploads/a.png", bytes: 1_000_000 },
    { order_id: A, bucket: "payment-proofs", path: "proofs/a.webp", bytes: 150_000 },
    { order_id: B, bucket: "designs", path: "uploads/b.png", bytes: "2000000" },
  ];
  it("only accepts 3 / 6 / 12 months", async () => {
    requireAdmin.mockResolvedValue({ supabase: fakeSupabase().sb });
    for (const m of [0, 1, 5, 24, NaN]) expect((await previewCleanup(m)).ok).toBe(false);
  });
  it("previews files, size and orders from the SQL selection", async () => {
    const { sb, calls } = fakeSupabase({ candidates: rows });
    requireAdmin.mockResolvedValue({ supabase: sb });
    expect(await previewCleanup(6)).toEqual({ ok: true, months: 6, files: 3, bytes: 3_150_000, orders: 2 });
    expect(calls.rpc).toEqual([["admin_file_cleanup_candidates", { p_months: 6 }]]);
    expect(removeStoredFiles).not.toHaveBeenCalled(); // a preview deletes nothing
  });
  it("runs: removes exactly those files and marks their orders (the orders stay)", async () => {
    const { sb, calls } = fakeSupabase({ candidates: rows });
    requireAdmin.mockResolvedValue({ supabase: sb });
    removeStoredFiles.mockResolvedValue({ removed: 3, failed: 0 });
    const res = await runCleanup(12);
    expect(removeStoredFiles.mock.calls[0][0]).toEqual(rows.map((r) => ({ bucket: r.bucket, path: r.path })));
    expect(calls.deleteIn).toEqual([]); // no order is deleted
    expect((calls.update[0] as [Record<string, unknown>, string[]])[1]).toEqual([A, B]);
    expect(res).toEqual({ ok: true, files: 3, bytes: 3_150_000, orders: 2, failed: 0 });
  });
});
