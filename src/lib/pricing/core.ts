import { fontLabel } from "@/lib/name-fonts";
import type { FontId, OrderMode } from "@/lib/types";

/** One-line description of a cart / order line. `colorName` is the colour's Arabic name. */
export function variantText(l: {
  colorName?: string | null;
  mode: OrderMode;
  text: string | null;
  font: FontId | null;
  designName: string | null;
}): string {
  const color = l.colorName ? ` — ${l.colorName}` : "";
  if (l.mode === "name") return `باسم «${l.text ?? ""}»${l.font ? ` — خط ${fontLabel(l.font)}` : ""}${color}`;
  if (l.mode === "design") return `بتصميمك: ${l.designName ?? "ملف مرفوع"}${color}`;
  return `زي ما هو${color}`;
}
