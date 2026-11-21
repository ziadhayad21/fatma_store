import { describe, expect, it } from "vitest";
import { joinSeedProduct } from "@/lib/data/seed-source";
import { seedProducts } from "@/lib/seed-products";
import type { Product } from "@/lib/types";
import { variantText } from "./core";
import { fromPrice, productPrice } from "./discount";
import { createShippingModule, priceOrder, PricingError, type OrderLineInput, type PricingModule } from "./order";

// chef-apron (aprons: sold per colour) at 100 in every colour; polka-dot-bag (bags: one price)
const apron: Product = { ...joinSeedProduct({ ...seedProducts.find((p) => p.slug === "chef-apron")!, base_price: 100 }) };
const products = new Map<string, Product>(seedProducts.map((p) => [p.slug, joinSeedProduct(p)]));
products.set("chef-apron", apron);

const line = (o: Partial<OrderLineInput> = {}): OrderLineInput => ({
  productId: "chef-apron", mode: "name", text: "Fatma", font: null, designPath: null, color: "black", qty: 1, ...o,
});
const shipping = createShippingModule(async (g) => (g === "القاهرة" ? 40 : null));
const price = (lines: OrderLineInput[], modules: PricingModule[] = [shipping], governorate = "القاهرة", catalog = products) =>
  priceOrder({ lines, products: catalog, governorate, modules });

const withColors = (prices: Record<string, number>): Map<string, Product> => {
  const p: Product = { ...apron, colors: apron.colors.filter((c) => c.id in prices).map((c) => ({ ...c, price: prices[c.id] })) };
  return new Map([["chef-apron", p]]);
};

describe("productPrice / fromPrice / variantText", () => {
  it("is one price whatever the ordering option (no printing cost)", async () => {
    const r = await price([line({ mode: "name", text: "Fatma" }), line({ mode: "name", text: "Ali" })], []);
    expect(r.lines.map((l) => l.unitPrice)).toEqual([100, 100]);
  });
  it("uses the selected colour's price, with the product discount applied", () => {
    const p = { base_price: 100, discount_percent: 10, has_colors: true, colors: [{ id: "black", price: 100 }, { id: "pink", price: 140 }] };
    expect(productPrice(p, { color: "pink" })).toEqual({ price: 126, originalPrice: 140, discountPercent: 10 });
    expect(productPrice(p, { color: "pink", qty: 2 }).price).toBe(252);
    expect(productPrice({ base_price: 90, discount_percent: null }).price).toBe(90);
  });
  it("shows «from» the lowest colour price only when colours differ", () => {
    expect(fromPrice({ base_price: 0, has_colors: true, colors: [{ id: "a", price: 150 }, { id: "b", price: 120 }] })).toMatchObject({ price: 120, from: true });
    expect(fromPrice({ base_price: 0, has_colors: true, colors: [{ id: "a", price: 120 }, { id: "b", price: 120 }] })).toMatchObject({ price: 120, from: false });
    expect(fromPrice({ base_price: 80 })).toMatchObject({ price: 80, from: false });
  });
  it("describes variants", () => {
    expect(variantText({ mode: "name", text: "Fatma", font: "ruqaa", designName: null })).toBe("باسم «Fatma» — خط رقعة");
    expect(variantText({ mode: "design", text: null, font: null, designName: "logo.png", colorName: "أسود" })).toBe("بتصميمك: logo.png — أسود");
    expect(variantText({ mode: "standard", text: null, font: null, designName: null })).toBe("زي ما هو");
  });
});

describe("priceOrder", () => {
  it("recomputes from product rows: colour price x qty, plus shipping", async () => {
    const r = await price([line({ qty: 2 }), line({ mode: "name", text: "Fatma", qty: 3 })]);
    expect(r.subtotal).toBe(100 * 5);
    expect(r.shipping).toBe(40);
    expect(r.total).toBe(500 + 40);
  });
  it("prices each colour separately and snapshots the colour name", async () => {
    const r = await price([line({ color: "black" }), line({ color: "pink", qty: 2 })], [], "القاهرة", withColors({ black: 100, pink: 130 }));
    expect(r.lines.map((l) => [l.color, l.colorName, l.unitPrice, l.lineTotal])).toEqual([["black", "أسود", 100, 100], ["pink", "بينك", 130, 260]]);
    expect(r.subtotal).toBe(360);
  });
  it("refuses a colour the product is not sold in", async () => {
    await expect(price([line({ color: "white" })], [], "القاهرة", withColors({ black: 100 }))).rejects.toMatchObject({ code: "bad_line" });
    await expect(price([line({ color: null })])).rejects.toMatchObject({ code: "bad_line" });
    await expect(price([line({ color: "Not A Color" })])).rejects.toMatchObject({ code: "bad_line" });
  });
  it("ignores any client-supplied price fields", async () => {
    const tampered = { ...line(), unitPrice: 1, price: 1 } as unknown as OrderLineInput;
    expect((await price([tampered])).subtotal).toBe(100);
  });
  it("strips personalization data from standard lines", async () => {
    const r = await price([line({ productId: "polka-dot-bag", mode: "standard", text: "x", font: "kufi", designPath: "a/b.png" })]);
    expect(r.lines[0]).toMatchObject({ text: null, font: null, designPath: null });
  });
  it("rejects bad lines", async () => {
    await expect(price([line({ productId: "nope" })])).rejects.toMatchObject({ code: "unknown_product" });
    await expect(price([line({ qty: 0 })])).rejects.toBeInstanceOf(PricingError);
    await expect(price([line({ qty: 51 })])).rejects.toBeInstanceOf(PricingError);
    await expect(price([line({ qty: 1.5 })])).rejects.toBeInstanceOf(PricingError);
    await expect(price([line({ mode: "name", text: "" })])).rejects.toBeInstanceOf(PricingError);
    await expect(price([line({ mode: "name", text: "ا".repeat(19) })])).rejects.toBeInstanceOf(PricingError);
    await expect(price([line({ mode: "design", designPath: null })])).rejects.toBeInstanceOf(PricingError);
    await expect(price([])).rejects.toMatchObject({ code: "empty" });
  });
  it("does not invent shipping: unknown governorate is an error", async () => {
    await expect(price([line()], [shipping], "الجيزة")).rejects.toMatchObject({ code: "no_shipping_rate" });
  });
  it("plugs in extra modules without touching the core", async () => {
    const giftWrap: PricingModule = {
      id: "gift",
      apply: (ctx) => [{ module: "gift", kind: "fee", label: "تغليف", amount: 10 * ctx.lines.length }],
    };
    const coupon: PricingModule = {
      id: "coupon",
      apply: (ctx) => [{ module: "coupon", kind: "discount", label: "كوبون", amount: -Math.round(ctx.subtotal * 0.1) }],
    };
    const r = await price([line({ qty: 2 })], [shipping, giftWrap, coupon]);
    expect(r.subtotal).toBe(200);
    expect(r.adjustments.map((a) => a.module)).toEqual(["shipping", "gift", "coupon"]);
    expect(r.total).toBe(200 + 40 + 10 - 20);
    expect(r.shipping).toBe(40);
  });
});

describe("category ordering rules", () => {
  it("colour products take a colour and no font", async () => {
    for (const color of ["black", "white", "pink"]) {
      const result = await price([line({ mode: "name", text: "Fatma", color, font: "kufi" })], []);
      expect(result.lines[0]).toMatchObject({ color, font: null });
    }
  });
  it("prevents customized bag orders and strips irrelevant fields from normal bags", async () => {
    for (const mode of ["name", "design"] as const) {
      await expect(price([line({ productId: "polka-dot-bag", mode, text: "Bag", font: "kufi", designPath: "x" })], [])).rejects.toBeInstanceOf(PricingError);
    }
    const bag = products.get("polka-dot-bag")!;
    const result = await price([line({ productId: "polka-dot-bag", mode: "standard", color: "pink", text: "ignored" })], []);
    expect(result.lines[0]).toMatchObject({ color: null, colorName: null, text: null, font: null, designPath: null, unitPrice: bag.base_price });
  });
  it("products without colours still need a font for a name", async () => {
    const plain: Product = { ...apron, category_slug: "other", has_colors: false, colors: [] };
    const catalog = new Map([["chef-apron", plain]]);
    await expect(price([line({ mode: "name", text: "Fatma", font: null, color: null })], [], "القاهرة", catalog)).rejects.toBeInstanceOf(PricingError);
    const ok = await price([line({ mode: "name", text: "Fatma", font: "kufi", color: "black" })], [], "القاهرة", catalog);
    expect(ok.lines[0]).toMatchObject({ font: "kufi", color: null, unitPrice: 100 });
  });
});

describe("DIY (اصنعها بنفسك) products", () => {
  const diy = new Map<string, Product>([["chef-apron", { ...apron, is_diy: true }]]);
  it("are sold only with a design, at the colour price, like any product", async () => {
    await expect(price([line({ mode: "name", text: "Fatma" })], [], "القاهرة", diy)).rejects.toBeInstanceOf(PricingError);
    const r = await price([line({ mode: "design", designPath: "uploads/x.png", color: "pink" })], [], "القاهرة", diy);
    expect(r.lines.map((l) => [l.mode, l.color, l.unitPrice])).toEqual([["design", "pink", 100]]);
  });
});

describe("couples (كابلز) products", () => {
  // aprons sell per colour; the colour prices differ on purpose: a couples product must ignore them
  const couples: Product = {
    ...apron,
    slug: "couples-apron",
    name_ar: "مريلة كابلز",
    base_price: 650,
    pieces_count: 2,
    piece_labels: ["المريلة الأولى", "المريلة التانية"],
    colors: apron.colors.map((c, i) => ({ ...c, price: [100, 140, 999][i] ?? 100 })),
  };
  const catalog = new Map<string, Product>([["couples-apron", couples]]);
  const piece = (o: Partial<{ color: string | null; text: string | null; designPath: string | null; designName: string | null }> = {}) => ({
    color: "black", text: null, designPath: null, designName: null, ...o,
  });
  const cl = (o: Partial<OrderLineInput> = {}): OrderLineInput =>
    line({ productId: "couples-apron", mode: "name", color: "black", pieces: [piece({ text: "A" }), piece({ text: "B" })], ...o });
  const priceC = (lines: OrderLineInput[], c = catalog) => price(lines, [], "القاهرة", c);
  const fails = async (l: OrderLineInput, c = catalog) => {
    await expect(priceC([l], c)).rejects.toBeInstanceOf(PricingError);
  };

  it("has ONE fixed price for the pair, whatever the colours", async () => {
    const r = await priceC([
      cl({ font: "kufi" }),
      cl({ font: "kufi", pieces: [piece({ color: "black", text: "A" }), piece({ color: "pink", text: "B" })] }),
      cl({ font: "kufi", pieces: [piece({ color: "white", text: "A" }), piece({ color: "pink", text: "B" })], qty: 2 }),
    ]);
    expect(r.lines.map((l) => l.unitPrice)).toEqual([650, 650, 650]);
    expect(r.lines.map((l) => l.lineTotal)).toEqual([650, 650, 1300]);
    expect(r.subtotal).toBe(2600);
    expect(fromPrice(couples)).toMatchObject({ price: 650, from: false });
    expect(productPrice(couples, { color: "pink" }).price).toBe(650);
  });

  it("applies the product discount to the fixed price", async () => {
    const discounted = new Map([["couples-apron", { ...couples, discount_percent: 10 }]]);
    const r = await priceC([cl({ font: "kufi", pieces: [piece({ text: "A" }), piece({ color: "pink", text: "B" })] })], discounted);
    expect(r.lines[0]).toMatchObject({ unitPrice: 585, originalUnitPrice: 650, discountPercent: 10 });
  });

  it("snapshots every piece (label, colour name) and keeps piece 1 as the line colour", async () => {
    const r = await priceC([cl({ mode: "name", font: "kufi", pieces: [piece({ text: " Beso  kitchen " }), piece({ color: "pink", text: "فاطمة" })] })]);
    const l = r.lines[0];
    expect(l.color).toBe("black");
    expect(l.font).toBe("kufi");
    expect(l.text).toBeNull();
    expect(l.pieces).toEqual([
      { label: "المريلة الأولى", color: "black", colorName: "أسود", text: "Beso kitchen", designPath: null, designName: null },
      { label: "المريلة التانية", color: "pink", colorName: "بينك", text: "فاطمة", designPath: null, designName: null },
    ]);
  });

  it("design mode keeps one design per piece", async () => {
    const r = await priceC([cl({ mode: "design", pieces: [piece({ designPath: "uploads/a.png", designName: "a.png" }), piece({ designPath: "uploads/b.png", designName: "b.png" })] })]);
    expect(r.lines[0].pieces!.map((p) => p.designPath)).toEqual(["uploads/a.png", "uploads/b.png"]);
    expect(r.lines[0].font).toBeNull();
  });

  it("rejects standard mode for couples", async () => {
    await fails(cl({ mode: "standard" }));
  });

  it("rejects incomplete or invalid pairs", async () => {
    await fails(cl({ pieces: null })); // no pieces
    await fails(cl({ pieces: [piece()] })); // one piece only
    await fails(cl({ pieces: [piece(), piece(), piece()] })); // too many
    await fails(cl({ pieces: [piece(), piece({ color: "green" })] })); // colour not sold
    await fails(cl({ pieces: [piece(), piece({ color: null })] })); // missing colour
    await fails(cl({ mode: "name", font: "kufi", pieces: [piece({ text: "Beso" }), piece({ text: "" })] })); // second name missing
    await fails(cl({ mode: "name", font: "kufi", pieces: [piece({ text: "Beso" }), piece({ text: "x".repeat(19) })] })); // over 18
    await fails(cl({ mode: "name", font: "kufi", pieces: [piece({ text: "Beso" }), piece({ text: "<b>" })] })); // bad characters
    await fails(cl({ mode: "name", font: null, pieces: [piece({ text: "Beso" }), piece({ text: "Sara" })] })); // shared font required
    await fails(cl({ mode: "design", pieces: [piece({ designPath: "uploads/a.png" }), piece()] })); // second design missing
    const unavailable = new Map([["couples-apron", { ...couples, colors: couples.colors.filter((c) => c.id !== "pink") }]]);
    await fails(cl({ pieces: [piece(), piece({ color: "pink" })] }), unavailable);
  });

  it("ignores pieces sent for a normal product", async () => {
    const r = await price([line({ pieces: [piece(), piece()] })], []);
    expect(r.lines[0].pieces).toBeNull();
    expect(r.lines[0].unitPrice).toBe(100);
  });
});
