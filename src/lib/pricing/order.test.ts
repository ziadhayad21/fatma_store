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
  productId: "chef-apron", mode: "standard", text: null, font: null, designPath: null, color: "black", qty: 1, ...o,
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
    const r = await price([line(), line({ mode: "name", text: "Fatma" }), line({ mode: "design", designPath: "uploads/x.png" })], []);
    expect(r.lines.map((l) => l.unitPrice)).toEqual([100, 100, 100]);
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
    expect(r.lines.map((l) => [l.color, l.colorName, l.unitPrice, l.lineTotal])).toEqual([["black", "أسود", 100, 100], ["pink", "وردي", 130, 260]]);
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
    const r = await price([line({ text: "x", font: "kufi", designPath: "a/b.png" })]);
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
    const result = await price([line({ productId: "polka-dot-bag", color: "pink", text: "ignored" })], []);
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
