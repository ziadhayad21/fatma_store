import { fontLabel } from "@/lib/name-fonts";
import type { FontId, OrderMode } from "@/lib/types";
import { productPrice, type ProductPricing } from "./discount";

/** Unit price = base + personalization fee (when not standard). The server recomputes with this same function. */
export function unitPrice(product: ProductPricing, mode: OrderMode): number {
  return productPrice(product, mode).price;
}

export function variantText(l: {
  mode: OrderMode;
  text: string | null;
  font: FontId | null;
  designName: string | null;
}): string {
  if (l.mode === "name") return `باسم «${l.text ?? ""}» — خط ${fontLabel(l.font)}`;
  if (l.mode === "design") return `بتصميمك: ${l.designName ?? "ملف مرفوع"}`;
  return "زي ما هو";
}
