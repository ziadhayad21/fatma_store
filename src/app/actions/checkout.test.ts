import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_COLORS } from "@/lib/data/seed-source";
import { seedCategories } from "@/lib/seed-categories";
import { seedProducts } from "@/lib/seed-products";

const PROOF = "proofs/2026-03/0b6c1f4e-8c0e-4f0a-9d53-0d1c3f3f2a11.png";
const UP = "uploads/2026-03/0b6c1f4e-8c0e-4f0a-9d53-0d1c3f3f2a11.png";

// ---- a tiny fake of the service-role client (only what placeOrder touches) ----
const state = {
  fees: { القاهرة: 40, الجيزة: null } as Record<string, number | null>,
  existing: new Set<string>([UP, PROOF]),
  rpcCalls: [] as { name: string; args: { p_order: Record<string, unknown>; p_items: Record<string, unknown>[] } }[],
  rpcError: null as { message: string } | null,
  discounts: new Map<string, number>(),
  /** per-product colour prices that differ from base_price */
  colorPrices: new Map<string, Record<string, number>>(),
};

function chain(resolve: () => unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "in", "eq", "order", "limit"]) q[m] = () => q;
  q.maybeSingle = async () => resolve();
  q.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, bad);
  return q;
}

vi.mock("@/lib/rate-limit", () => ({ allow: async () => true, RATE_LIMITED_MESSAGE: "limited" }));

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
              data: seedProducts.map((p) => {
                const cat = cats.get(p.category_id)!;
                // same shape as PRODUCT_SELECT: category + product_colors(price, is_available, color:colors(...))
                const product_colors = cat.has_colors
                  ? SEED_COLORS.map((c, i) => ({ price: state.colorPrices.get(p.slug)?.[c.id] ?? p.base_price, is_available: true, color: { ...c, sort: i + 1, is_active: true } }))
                  : [];
                return { ...p, discount_percent: state.discounts.get(p.slug) ?? null, category: { slug: cat.slug, name_ar: cat.name_ar, is_active: true, has_colors: cat.has_colors }, product_colors };
              }),
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
          download: async (path: string) => ({ data: state.existing.has(path) ? new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])], { type: "image/png" }) : null, error: null }),
          remove: async () => ({}),
        }),
      },
    };
    return sb;
  },
}));

const { placeOrder } = await import("./checkout");

const customer = { name: "فاطمة أحمد", phone: "01012345678", governorate: "القاهرة", area: "مدينة نصر", address: "12 شارع التسعين", notes: "" };
const std = (o = {}) => ({ productId: "chef-apron", mode: "name", text: "فاطمة", font: null, designPath: null, qty: 1, color: "black", ...o });
const place = (o: Record<string, unknown> = {}) =>
  placeOrder({ customer, lines: [std()], paymentMethod: "cod", depositMethod: "instapay", paymentProofPath: PROOF, ...o } as Parameters<typeof placeOrder>[0]);

beforeEach(() => {
  state.rpcCalls.length = 0;
  state.rpcError = null;
  state.discounts.clear();
  state.colorPrices.clear();
});

describe("placeOrder", () => {
  it("prices on the server and writes one atomic order", async () => {
    const r = await place({
      lines: [
        std({ qty: 2, price: 1, unitPrice: 1 }), // tampered prices are ignored (never read)
        std({ mode: "name", text: "  Fatma ", font: "ruqaa", qty: 3 }),
        std({ mode: "name", text: "Ali" }),
      ],
    });
    expect(r).toMatchObject({ ok: true, number: 1001 });
    const { p_order, p_items } = state.rpcCalls[0].args;
    expect(state.rpcCalls[0].name).toBe("create_order");
    const apron = seedProducts.find((p) => p.slug === "chef-apron")!;
    // one price whatever the option: no printing cost on name / design lines
    const subtotal = apron.base_price * (2 + 3 + 1);
    expect(p_order).toMatchObject({ subtotal, shipping: 40, total: subtotal + 40, payment_method: "cod", phone: "01012345678" });
    expect(p_items).toHaveLength(3);
    expect(p_items[1]).toMatchObject({ mode: "name", text: "Fatma", font: null, color: "black", unit_price: apron.base_price, qty: 3, design_path: null });
    expect(p_items[2]).toMatchObject({ mode: "name", text: "Ali", font: null, color: "black", unit_price: apron.base_price, qty: 1 });
    expect(p_items[0].product_id).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("charges a mixed cart from the saved discounts and snapshots the original and final prices", async () => {
    state.discounts.set("chef-apron", 50);
    const apron = seedProducts.find((p) => p.slug === "chef-apron")!;
    const bag = seedProducts.find((p) => p.slug === "polka-dot-bag")!;
    const discounted = apron.base_price / 2;
    const original = apron.base_price;
    const subtotal = discounted * 2 + bag.base_price;
    const result = await place({
      lines: [
        std({ mode: "name", text: "Fatma", font: "ruqaa", qty: 2, discount_percent: 99, unit_price: 1 }),
        std({ productId: "polka-dot-bag", mode: "standard", text: null, unitPrice: 1 }),
      ],
    });
    expect(result.ok).toBe(true);
    const { p_order, p_items } = state.rpcCalls[0].args;
    expect(p_order).toMatchObject({ subtotal, shipping: 40, total: subtotal + 40 });
    expect(p_items[0]).toMatchObject({ unit_price: discounted, original_unit_price: original, discount_percent: 50 });
    expect(p_items[1]).toMatchObject({ unit_price: bag.base_price, original_unit_price: null, discount_percent: null });
  });

  it("charges the selected colour's price, never a client price", async () => {
    state.colorPrices.set("chef-apron", { pink: 175 });
    const apron = seedProducts.find((p) => p.slug === "chef-apron")!;
    const result = await place({ lines: [std({ color: "pink", qty: 2, unitPrice: 1 }), std({ color: "black" })] });
    expect(result.ok).toBe(true);
    const { p_order, p_items } = state.rpcCalls[0].args;
    expect(p_items[0]).toMatchObject({ color: "pink", unit_price: 175, qty: 2 });
    expect(p_items[1]).toMatchObject({ color: "black", unit_price: apron.base_price });
    expect(p_order.subtotal).toBe(350 + apron.base_price);
  });

  it("requires a real transfer proof and never accepts a client payment status or amount", async () => {
    for (const paymentProofPath of [undefined, "../../x.png", PROOF.replace("0b6c", "ffff")]) {
      expect((await place({ paymentProofPath })).ok).toBe(false);
    }
    expect(state.rpcCalls).toHaveLength(0);
    expect((await place({ deposit_status: "confirmed", deposit_amount: 1, customizationNotes: "Make text smaller" })).ok).toBe(true);
    const saved = state.rpcCalls[0].args.p_order;
    expect(saved.deposit_status).toBe("submitted");
    expect(saved.deposit_percent).toBe(50);
    expect(saved.deposit_amount).toBe(Math.round(Number(saved.total) * 50) / 100);
    expect(saved.customization_notes).toBe("Make text smaller");
  });

  it("keeps bags on normal checkout without a deposit or customization notes", async () => {
    expect((await place({ lines: [std({ productId: "polka-dot-bag", mode: "standard", text: null })], paymentProofPath: undefined, depositMethod: undefined, customizationNotes: "ignore" })).ok).toBe(true);
    expect(state.rpcCalls[0].args.p_order).toMatchObject({ deposit_amount: 0, deposit_status: null, payment_proof_path: null, customization_notes: null });
    expect(state.rpcCalls[0].args.p_items[0]).toMatchObject({ mode: "standard", color: null });
    expect((await place({ lines: [std({ productId: "polka-dot-bag", mode: "name", text: "Bag" })] })).ok).toBe(false);
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
    for (const line of [std({ productId: "ghost" }), std({ qty: 0 }), std({ qty: 51 }), std({ mode: "name", text: "", font: "ruqaa" }), std({ color: "blue" }), std({ mode: "design", designPath: null })]) {
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
