import type { OrderMode, Product } from "@/lib/types";

export type ProductPricing = Pick<Product, "base_price" | "discount_percent" | "personalization_fee">;
export type PriceBreakdown = { price: number; originalPrice: number | null; discountPercent: number | null };

export function validDiscountPercent(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 100;
}

export function saleBasePrice(product: Pick<ProductPricing, "base_price" | "discount_percent">): number {
  const discount = product.discount_percent ?? 0;
  if (!validDiscountPercent(discount)) return product.base_price;
  const cents = Math.round(product.base_price * 100);
  const basisPoints = Math.round(discount * 100);
  return Math.round(cents * (10_000 - basisPoints) / 10_000) / 100;
}

export function personalizationPrice(product: ProductPricing, mode: OrderMode): number {
  return mode === "standard" ? 0 : product.personalization_fee;
}

export const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function productPrice(product: ProductPricing, mode: OrderMode = "standard", quantity = 1): PriceBreakdown {
  const fee = personalizationPrice(product, mode);
  const discount = product.discount_percent ?? 0;
  const hasDiscount = validDiscountPercent(discount);
  return {
    price: roundMoney((saleBasePrice(product) + fee) * quantity),
    originalPrice: hasDiscount ? roundMoney((product.base_price + fee) * quantity) : null,
    discountPercent: hasDiscount ? discount : null,
  };
}
