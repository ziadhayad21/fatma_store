import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedCategories } from "@/lib/seed-categories";
import { seedProducts } from "@/lib/seed-products";

const UP = "uploads/2026-03/0b6c1f4e-8c0e-4f0a-9d53-0d1c3f3f2a11.png";

// ---- a tiny fake of the service-role client (only what placeOrder touches) ----
const state = {
  fees: { القاهرة: 40, الجيزة: null } as Record<string, number | null>,
  existing: new Set<string>([UP]),
  rpcCalls: [] as { name: string; args: { p_order: Record<string, unknown>; p_items: Record<string, unknown>[] } }[],
  rpcError: null as { message: string } | null,
};

function chain(resolve: () => unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "in", "eq", "order", "limit"]) q[m] = () => q;
  q.maybeSingle = async () => resolve();
  q.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, bad);
  return q;
}

vi.mock("@/lib/supabase/admin", () => ({
  backendConfigured: () => true,
  createServiceClient: () => {
    const sb = {
      from(table: string) {
        let eqVal = "";
        const q = chain(() => {
          if (table === "products") {
            const cats = new Map(seedCategories.map((c) => [c.id, c]));
            return {
              data: seedProducts.map((p) => ({ ...p, category: { slug: cats.get(p.category_id)!.slug, name_ar: cats.get(p.category_id)!.name_ar, is_active: true } })),
              error: null,
            };
          }
          if (table === "shipping_rates") return { data: eqVal in state.fees ? { fee: state.fees[eqVal] } : null, error: null };
          return { data: null, error: null };
        });
        const origEq = q.eq as () => unknown;
        q.eq = (_c: string, v: string) => {
          eqVal = v;
          return origEq();
        };
        return q;
      },
      rpc: async (name: string, args: never) => {
        state.rpcCalls.push({ name, args });
        return state.rpcError ? { data: null, error: state.rpcError } : { data: { id: "11111111-2222-4333-8444-555555555555", number: 1001 }, error: null };
      },
      storage: {
        from: () => ({
          list: async (_dir: string, opts: { search: string }) => ({
            data: [...state.existing].filter((p) => p.endsWith(opts.search)).map((p) => ({ name: p.split("/").pop(), metadata: { size: 1000, mimetype: "image/png" } })),
            error: null,
          }),
          remove: async () => ({}),
        }),
      },
    };
    return sb;
  },
}));

const { placeOrder } = await import("./checkout");

const customer = { name: "فاطمة أحمد", phone: "01012345678", governorate: "القاهرة", area: "مدينة نصر", address: "12 شارع التسعين", notes: "" };
const std = (o = {}) => ({ productId: "chef-apron", mode: "standard", text: null, font: null, designPath: null, qty: 1, ...o });
const place = (o: Record<string, unknown> = {}) =>
  placeOrder({ customer, lines: [std()], paymentMethod: "cod", ...o } as Parameters<typeof placeOrder>[0]);

beforeEach(() => {
  state.rpcCalls.length = 0;
  state.rpcError = null;
});

describe("placeOrder", () => {
  it("prices on the server and writes one atomic order", async () => {
    const r = await place({
      lines: [
        std({ qty: 2, price: 1, unitPrice: 1 }), // tampered prices are ignored (never read)
        std({ mode: "name", text: "  Fatma ", font: "ruqaa", qty: 3 }),
        std({ productId: "polka-dot-bag", mode: "design", designPath: UP }),
      ],
    });
    expect(r).toMatchObject({ ok: true, number: 1001 });
    const { p_order, p_items } = state.rpcCalls[0].args;
    expect(state.rpcCalls[0].name).toBe("create_order");
    expect(p_order).toMatchObject({ subtotal: 100 * 2 + 125 * 3 + 125, shipping: 40, total: 700 + 40, payment_method: "cod", phone: "01012345678" });
    expect(p_items).toHaveLength(3);
    expect(p_items[1]).toMatchObject({ mode: "name", text: "Fatma", font: "ruqaa", unit_price: 125, qty: 3, design_path: null });
    expect(p_items[2]).toMatchObject({ mode: "design", design_path: UP, text: null, font: null });
    expect(p_items[0].product_id).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("normalizes Arabic-digit phone numbers", async () => {
    await place({ customer: { ...customer, phone: "٠١٠١٢٣٤٥٦٧٨" } });
    expect(state.rpcCalls[0].args.p_order.phone).toBe("01012345678");
  });

  it("returns field errors for bad customer data and writes nothing", async () => {
    const r = await place({ customer: { ...customer, phone: "123", governorate: "Nope" } });
    expect(r).toMatchObject({ ok: false, fieldErrors: { phone: expect.any(String), governorate: expect.any(String) } });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("refuses a governorate whose shipping fee is not set (no invented fee)", async () => {
    const r = await place({ customer: { ...customer, governorate: "الجيزة" } });
    expect(r).toMatchObject({ ok: false, fieldErrors: { governorate: expect.any(String) } });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("rejects unknown products, bad qty, incomplete personalization, empty carts", async () => {
    for (const line of [std({ productId: "ghost" }), std({ qty: 0 }), std({ qty: 51 }), std({ mode: "name", text: "", font: "ruqaa" }), std({ mode: "name", text: "x", font: null }), std({ mode: "design", designPath: null })]) {
      expect((await place({ lines: [line] })).ok).toBe(false);
    }
    expect((await place({ lines: [] })).ok).toBe(false);
    expect((await place({ lines: "nope" as never })).ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("rejects design paths that are malformed or not in the bucket", async () => {
    expect((await place({ lines: [std({ mode: "design", designPath: "../../etc/passwd" })] })).ok).toBe(false);
    expect((await place({ lines: [std({ mode: "design", designPath: UP.replace("0b6c", "ffff") })] })).ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("rejects unknown payment methods and the honeypot", async () => {
    expect((await place({ paymentMethod: "card" })).ok).toBe(false);
    expect((await place({ website: "http://spam" })).ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("surfaces a database failure without leaking details", async () => {
    state.rpcError = { message: "boom: secret internals" };
    const r = await place();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toMatch(/boom|secret/);
  });
});
