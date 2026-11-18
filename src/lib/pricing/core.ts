import { COLOR_LABEL, type ProductColor } from "@/lib/product-rules";
import { fontLabel } from "@/lib/name-fonts";
import type { FontId, OrderMode } from "@/lib/types";
import { productPrice, type ProductPricing } from "./discount";

/** Unit price = base + personalization fee (when not standard). The server recomputes with this same function. */
export function unitPrice(product: ProductPricing, mode: OrderMode): number {
  return productPrice(product, mode).price;
}

export function variantText(l: {
  color?: ProductColor | null;
  mode: OrderMode;
  text: string | null;
  font: FontId | null;
  designName: string | null;
}): string {
  const color = l.color ? ` — ${COLOR_LABEL[l.color]}` : "";
  if (l.mode === "name") return `باسم «${l.text ?? ""}»${l.font ? ` — خط ${fontLabel(l.font)}` : ""}${color}`;
  if (l.mode === "design") return `بتصميمك: ${l.designName ?? "ملف مرفوع"}${color}`;
  return `زي ما هو${color}`;
}
