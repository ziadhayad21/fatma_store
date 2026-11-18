import { describe, expect, it } from "vitest";
import { seedProducts } from "@/lib/seed-products";
import type { Product } from "@/lib/types";
import { unitPrice, variantText } from "./core";
import { createShippingModule, priceOrder, PricingError, type OrderLineInput, type PricingModule } from "./order";

const products = new Map<string, Product>(
  seedProducts.map((p) => [p.slug, { ...p, ...(p.slug === "chef-apron" ? { base_price: 100, personalization_fee: 25 } : {}), category_slug: "x", category_name: "x" }]),
);
const base = { base_price: 100, personalization_fee: 25 };
const line = (o: Partial<OrderLineInput> = {}): OrderLineInput => ({
  productId: "chef-apron", mode: "standard", text: null, font: null, designPath: null, qty: 1, ...o,
});
const shipping = createShippingModule(async (g) => (g === "القاهرة" ? 40 : null));
const price = (lines: OrderLineInput[], modules: PricingModule[] = [shipping], governorate = "القاهرة") =>
  priceOrder({ lines, products, governorate, modules });

describe("unitPrice / variantText", () => {
  it("adds the fee only for personalized modes", () => {
    expect(unitPrice(base, "standard")).toBe(100);
    expect(unitPrice(base, "name")).toBe(125);
    expect(unitPrice(base, "design")).toBe(125);
  });
  it("describes variants", () => {
    expect(variantText({ mode: "name", text: "Fatma", font: "ruqaa", designName: null })).toBe("باسم «Fatma» — خط رقعة");
    expect(variantText({ mode: "design", text: null, font: null, designName: "logo.png" })).toBe("بتصميمك: logo.png");
    expect(variantText({ mode: "standard", text: null, font: null, designName: null })).toBe("زي ما هو");
  });
});

describe("priceOrder", () => {
  it("recomputes from product rows: (base + fee) x qty, plus shipping", async () => {
    const r = await price([line({ qty: 2 }), line({ mode: "name", text: "Fatma", font: "ruqaa", qty: 3 })]);
    expect(r.subtotal).toBe(100 * 2 + 125 * 3);
    expect(r.shipping).toBe(40);
    expect(r.total).toBe(575 + 40);
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
    await expect(price([line({ mode: "name", text: "", font: "ruqaa" })])).rejects.toBeInstanceOf(PricingError);
    await expect(price([line({ mode: "name", text: "ا".repeat(19), font: "ruqaa" })])).rejects.toBeInstanceOf(PricingError);
    await expect(price([line({ mode: "name", text: "Fatma", font: null })])).rejects.toBeInstanceOf(PricingError);
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
  const product = (category_slug: string) => ({ ...products.get("chef-apron")!, category_slug });
  it.each(["aprons", "towels"])("uses exactly the supported colors and no font for %s", async (category) => {
    const catalog = new Map([["chef-apron", product(category)]]);
    for (const color of ["black", "white", "pink"] as const) {
      const result = await priceOrder({ lines: [line({ mode: "name", text: "Fatma", color, font: "kufi" })], products: catalog, governorate: "القاهرة", modules: [] });
      expect(result.lines[0]).toMatchObject({ color, font: null });
    }
    await expect(priceOrder({ lines: [line()], products: catalog, governorate: "القاهرة", modules: [] })).rejects.toBeInstanceOf(PricingError);
  });
  it("prevents customized bag orders and strips irrelevant fields from normal bags", async () => {
    const catalog = new Map([["chef-apron", product("bags")]]);
    for (const mode of ["name", "design"] as const) {
      await expect(priceOrder({ lines: [line({ mode, text: "Bag", font: "kufi", designPath: "x" })], products: catalog, governorate: "القاهرة", modules: [] })).rejects.toBeInstanceOf(PricingError);
    }
    const result = await priceOrder({ lines: [line({ color: "pink", text: "ignored" })], products: catalog, governorate: "القاهرة", modules: [] });
    expect(result.lines[0]).toMatchObject({ color: null, text: null, font: null, designPath: null, unitPrice: 100 });
  });
});
