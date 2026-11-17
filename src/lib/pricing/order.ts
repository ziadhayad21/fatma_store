import "server-only";
import { MAX_QTY } from "@/lib/limits";
import { isFontId, normalizeName, validateName } from "@/lib/personalization";
import type { FontId, OrderMode, Product } from "@/lib/types";
import { productPrice, roundMoney } from "./discount";

/**
 * THE server-side pricing module for orders. Checkout (phase 4) calls only `priceOrder`.
 *
 * Prices always come from the product rows (never from the client). Everything beyond
 * `unit price × qty` is a PricingModule that contributes `Adjustment`s, so future add-ons
 * (coupons, gift wrapping, online-payment fees, a shipping-company API) are new modules
 * added to the list — the checkout UI and this core don't change.
 */

export type OrderLineInput = {
  productId: string; // product slug
  mode: OrderMode;
  text: string | null;
  font: FontId | null;
  designPath: string | null;
  qty: number;
};

export type PricedLine = OrderLineInput & {
  productName: string;
  unitPrice: number;
  originalUnitPrice: number | null;
  discountPercent: number | null;
  lineTotal: number;
};

export type AdjustmentKind = "shipping" | "discount" | "fee";
export type Adjustment = { module: string; kind: AdjustmentKind; label: string; amount: number };

export type PricingContext = {
  lines: PricedLine[];
  subtotal: number;
  governorate: string;
};

export interface PricingModule {
  id: string;
  apply(ctx: PricingContext): Adjustment[] | Promise<Adjustment[]>;
}

export type PricedOrder = {
  lines: PricedLine[];
  subtotal: number;
  adjustments: Adjustment[];
  shipping: number;
  total: number;
};

export class PricingError extends Error {
  constructor(
    message: string,
    public readonly code: "unknown_product" | "bad_line" | "no_shipping_rate" | "empty",
  ) {
    super(message);
  }
}

/** Checks one cart line against its product. Throws PricingError; returns the cleaned line. */
export function cleanLine(line: OrderLineInput, product: Product | undefined): OrderLineInput {
  if (!product) throw new PricingError("منتج مش موجود", "unknown_product");
  if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_QTY) {
    throw new PricingError("الكمية غير صحيحة", "bad_line");
  }
  if (line.mode === "standard") {
    return { ...line, text: null, font: null, designPath: null };
  }
  if (line.mode === "name") {
    const v = validateName(line.text ?? "");
    if (!v.ok) throw new PricingError(v.error, "bad_line");
    if (!isFontId(line.font)) throw new PricingError("اختار الخط", "bad_line");
    return { ...line, text: normalizeName(line.text ?? ""), designPath: null };
  }
  if (line.mode === "design") {
    if (!line.designPath) throw new PricingError("ارفع التصميم", "bad_line");
    return { ...line, text: null, font: null };
  }
  throw new PricingError("طريقة طلب غير معروفة", "bad_line");
}

/** Shipping as a module: the rate lookup is injected (phase 4: the shipping_rates table). */
export function createShippingModule(lookup: (governorate: string) => Promise<number | null>): PricingModule {
  return {
    id: "shipping",
    async apply(ctx) {
      const fee = await lookup(ctx.governorate);
      if (fee === null) throw new PricingError("الشحن لمحافظتك مش متاح دلوقتي", "no_shipping_rate");
      return [{ module: "shipping", kind: "shipping", label: "الشحن", amount: fee }];
    },
  };
}

export async function priceOrder(input: {
  lines: OrderLineInput[];
  products: Map<string, Product>;
  governorate: string;
  modules: PricingModule[];
}): Promise<PricedOrder> {
  if (input.lines.length === 0) throw new PricingError("السلة فاضية", "empty");

  const lines: PricedLine[] = input.lines.map((raw) => {
    const product = input.products.get(raw.productId);
    const clean = cleanLine(raw, product);
    const unit = productPrice(product!, clean.mode);
    return {
      ...clean,
      productName: product!.name_ar,
      unitPrice: unit.price,
      originalUnitPrice: unit.originalPrice,
      discountPercent: unit.discountPercent,
      lineTotal: roundMoney(unit.price * clean.qty),
    };
  });
  const subtotal = roundMoney(lines.reduce((a, l) => a + l.lineTotal, 0));

  const ctx: PricingContext = { lines, subtotal, governorate: input.governorate };
  const adjustments: Adjustment[] = [];
  for (const m of input.modules) adjustments.push(...(await m.apply(ctx)));

  const shipping = adjustments.filter((a) => a.kind === "shipping").reduce((a, x) => a + x.amount, 0);
  const total = Math.max(0, roundMoney(subtotal + adjustments.reduce((a, x) => a + x.amount, 0)));
  return { lines, subtotal, adjustments, shipping, total };
}
