import { fontLabel } from "@/lib/name-fonts";
import { colorLabel } from "@/lib/product-rules";
import type { FontId, OrderMode } from "@/lib/types";

type ItemOption = { mode: OrderMode; text: string | null; font: FontId | null; color?: string | null; color_name?: string | null };

/** One short line for an order item: option · colour · font. Same wording on the order page and the invoice. */
export function itemOptionLine(item: ItemOption): string {
  const parts = [item.mode === "name" ? `باسم «${item.text ?? ""}»` : item.mode === "design" ? "بتصميم العميل" : "زي ما هو"];
  const color = item.color ? colorLabel(item) : null;
  if (color) parts.push(`اللون: ${color}`);
  if (item.mode === "name" && item.font) parts.push(`خط ${fontLabel(item.font)}`);
  return parts.join(" · ");
}
