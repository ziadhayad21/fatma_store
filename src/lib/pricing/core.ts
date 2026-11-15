import { fontLabel } from "@/lib/name-fonts";
import type { FontId, OrderMode, Product } from "@/lib/types";

/** Unit price = base + personalization fee (when not standard). The server recomputes with this same function. */
export function unitPrice(product: Pick<Product, "base_price" | "personalization_fee">, mode: OrderMode): number {
  return product.base_price + (mode === "standard" ? 0 : product.personalization_fee);
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
