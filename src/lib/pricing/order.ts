import "server-only";
import { isCouples, pieceLabels, type LinePiece } from "@/lib/couples";
import { productRules, isProductColor, type ProductColor } from "@/lib/product-rules";
import { MAX_QTY } from "@/lib/limits";
import { isFontId, normalizeName, validateName } from "@/lib/personalization";
import type { FontId, OrderMode, Product } from "@/lib/types";
import { findColor, productPrice, roundMoney } from "./discount";

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
  color?: ProductColor | null;
  /** couples products: one entry per piece (colour + name / design). Null for every other product. */
  pieces?: LinePiece[] | null;
  qty: number;
};

export type PricedPiece = LinePiece & { label: string; colorName: string | null };

export type PricedLine = Omit<OrderLineInput, "pieces"> & {
  pieces: PricedPiece[] | null;
  productName: string;
  /** Arabic name of the chosen colour (snapshotted on the order item) */
  colorName: string | null;
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

/**
 * A couples line: every piece needs an available colour, and (by option) its own name or design.
 * Both names share the line's font. The line's own color = piece 1's (the order item keeps piece 1 in its
 * columns; the pieces snapshot holds all of them).
 */
function cleanCouplesLine(line: OrderLineInput, product: Product, rules: ReturnType<typeof productRules>): OrderLineInput {
  const n = product.pieces_count ?? 2;
  const pieces = line.pieces;
  if (!Array.isArray(pieces) || pieces.length !== n) throw new PricingError("اختار تفاصيل كل قطعة", "bad_line");
  const labels = pieceLabels(product);
  const clean: LinePiece[] = pieces.map((p, i) => {
    const color = rules.colors ? p?.color : null;
    if (rules.colors && !(isProductColor(color) && findColor(product, color))) throw new PricingError(`اختار لون ${labels[i]}`, "bad_line");
    if (line.mode === "name") {
      const v = validateName(p?.text ?? "");
      if (!v.ok) throw new PricingError(`${labels[i]}: ${v.error}`, "bad_line");
      return { color: color ?? null, text: normalizeName(p.text ?? ""), designPath: null, designName: null };
    }
    if (line.mode === "design") {
      if (!p?.designPath) throw new PricingError(`ارفع تصميم ${labels[i]}`, "bad_line");
      return { color: color ?? null, text: null, designPath: p.designPath, designName: p.designName ?? null };
    }
    return { color: color ?? null, text: null, designPath: null, designName: null };
  });
  if (line.mode === "name" && !isFontId(line.font)) throw new PricingError("اختار الخط", "bad_line");
  return {
    ...line,
    color: clean[0].color,
    text: null,
    font: line.mode === "name" ? line.font : null,
    designPath: null,
    pieces: clean,
  };
}

/** Checks one cart line against its product. Throws PricingError; returns the cleaned line. */
export function cleanLine(line: OrderLineInput, product: Product | undefined): OrderLineInput {
  if (!product) throw new PricingError("منتج مش موجود", "unknown_product");
  if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_QTY) {
    throw new PricingError("الكمية غير صحيحة", "bad_line");
  }
  const rules = productRules(product);
  if (line.mode !== "standard" && line.mode !== "name" && line.mode !== "design") throw new PricingError("طريقة طلب غير معروفة", "bad_line");
  if (isCouples(product)) {
    if (!rules.customization && line.mode !== "standard") throw new PricingError("المنتج ده متاح بدون تخصيص فقط", "bad_line");
    if (!rules.standard && line.mode === "standard") throw new PricingError("اكتبوا أساميكم أو ارفعوا تصميمكم للمنتج ده", "bad_line");
    return cleanCouplesLine(line, product, rules);
  }
  line = { ...line, pieces: null };
  if (!rules.customization && line.mode !== "standard") throw new PricingError("الشنط متاحة بدون تخصيص فقط", "bad_line");
  if (!rules.standard && line.mode === "standard") throw new PricingError("اكتب اسمك أو ارفع تصميمك للمنتج ده", "bad_line");
  // the colour must be one the product is currently sold in (its price comes from that colour)
  if (rules.colors && !(isProductColor(line.color) && findColor(product, line.color))) {
    throw new PricingError("اختار اللون", "bad_line");
  }
  line = { ...line, color: rules.colors ? line.color : null };
  if (line.mode === "standard") {
    return { ...line, text: null, font: null, designPath: null };
  }
  if (line.mode === "name") {
    const v = validateName(line.text ?? "");
    if (!v.ok) throw new PricingError(v.error, "bad_line");
    if (rules.font && !isFontId(line.font)) throw new PricingError("اختار الخط", "bad_line");
    return { ...line, text: normalizeName(line.text ?? ""), font: rules.font ? line.font : null, designPath: null };
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
    // couples products: one fixed price for the set, whatever the colours (productPrice ignores them)
    const unit = productPrice(product!, { color: clean.color });
    const labels = pieceLabels(product!);
    return {
      ...clean,
      pieces: clean.pieces ? clean.pieces.map((p, i) => ({ ...p, label: labels[i], colorName: findColor(product!, p.color)?.name_ar ?? null })) : null,
      productName: product!.name_ar,
      colorName: findColor(product!, clean.color)?.name_ar ?? null,
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
