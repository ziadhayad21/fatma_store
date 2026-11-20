import { COUPLE_MODE_LABEL, pieceLine, type StoredPiece } from "@/lib/couples";
import { fontLabel } from "@/lib/name-fonts";
import { colorLabel } from "@/lib/product-rules";
import type { FontId, OrderMode } from "@/lib/types";

type ItemOption = {
  mode: OrderMode;
  text: string | null;
  font: FontId | null;
  color?: string | null;
  color_name?: string | null;
  pieces?: StoredPiece[] | null;
};

/** One short line for an order item: option · colour · font. Same wording on the order page and the invoice. */
export function itemOptionLine(item: ItemOption): string {
  // couples: the option (+ the shared font); colours and names are on the per-piece lines
  if (item.pieces?.length) {
    const font = item.mode === "name" ? item.pieces[0]?.font : null;
    return [COUPLE_MODE_LABEL[item.mode], font ? `خط ${fontLabel(font)}` : null].filter(Boolean).join(" · ");
  }
  const parts = [item.mode === "name" ? `باسم «${item.text ?? ""}»` : item.mode === "design" ? "بتصميم العميل" : "زي ما هو"];
  const color = item.color ? colorLabel(item) : null;
  if (color) parts.push(`اللون: ${color}`);
  if (item.mode === "name" && item.font) parts.push(`خط ${fontLabel(item.font)}`);
  return parts.join(" · ");
}

/** Couples item: "المريلة الأولى: أسود — Beso kitchen", one per piece (empty for other items). */
export function itemPieceLines(item: Pick<ItemOption, "mode" | "pieces">): string[] {
  return (item.pieces ?? []).map((p, i) =>
    pieceLine(p.label || `القطعة ${i + 1}`, { colorName: p.color_name ?? p.color, text: p.text, designName: p.design_name }, item.mode),
  );
}
