import type { ColorOption, Product } from "@/lib/types";

/**
 * One price per product, or per colour when the product's category sells by colour.
 * The ordering option (as is / your name / your design) never changes the price.
 */
export type ProductPricing = Pick<Product, "base_price" | "discount_percent"> & {
  has_colors?: boolean;
  colors?: Pick<ColorOption, "id" | "price">[];
};
export type PriceBreakdown = { price: number; originalPrice: number | null; discountPercent: number | null };

export function validDiscountPercent(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 100;
}

export const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** `price` after the product's discount (exact to the piastre). */
export function applyDiscount(price: number, discountPercent: number | null | undefined): number {
  const discount = discountPercent ?? 0;
  if (!validDiscountPercent(discount)) return price;
  const cents = Math.round(price * 100);
  const basisPoints = Math.round(discount * 100);
  return Math.round(cents * (10_000 - basisPoints) / 10_000) / 100;
}

/** base_price after discount (for colour products base_price is kept equal to the lowest colour price). */
export function saleBasePrice(product: Pick<ProductPricing, "base_price" | "discount_percent">): number {
  return applyDiscount(product.base_price, product.discount_percent);
}

/** The colour entry for `colorId`, when the product is sold per colour and has it available. */
export function findColor<C extends Pick<ColorOption, "id">>(product: { has_colors?: boolean; colors?: C[] }, colorId: string | null | undefined): C | undefined {
  if (!product.has_colors || !colorId) return undefined;
  return product.colors?.find((c) => c.id === colorId);
}

/** List price before discount: the colour's price, or base_price. */
export function listPrice(product: ProductPricing, colorId?: string | null): number {
  return findColor(product, colorId)?.price ?? product.base_price;
}

export function productPrice(
  product: ProductPricing,
  { color = null, qty = 1 }: { color?: string | null; qty?: number } = {},
): PriceBreakdown {
  const list = listPrice(product, color);
  const discount = product.discount_percent ?? 0;
  const hasDiscount = validDiscountPercent(discount);
  return {
    price: roundMoney(applyDiscount(list, discount) * qty),
    originalPrice: hasDiscount ? roundMoney(list * qty) : null,
    discountPercent: hasDiscount ? discount : null,
  };
}

/**
 * Card / listing price. For colour products: the lowest available colour price, and `from: true`
 * when the colours do not all cost the same (shown as "من …").
 */
export function fromPrice(product: ProductPricing): PriceBreakdown & { from: boolean } {
  const prices = product.has_colors ? (product.colors ?? []).map((c) => c.price) : [];
  if (prices.length === 0) return { ...productPrice(product), from: false };
  const lowest = Math.min(...prices);
  return { ...productPrice({ ...product, has_colors: false, base_price: lowest }), from: new Set(prices).size > 1 };
}
