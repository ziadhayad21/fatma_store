import { couplesDetails, isCouples, lineDesignPaths, pieceLabels } from "@/lib/couples";
import { variantText } from "@/lib/pricing";
import { findColor } from "@/lib/pricing/discount";
import type { Product } from "@/lib/types";
import type { CartLine } from "@/store/cart";

/** The text lines under a cart line: one for a normal product, option + one per piece for couples. */
export function lineDetails(l: CartLine, p: Product): string[] {
  if (isCouples(p) && l.pieces?.length) {
    return couplesDetails(
      pieceLabels(p),
      l.mode,
      l.font ?? null,
      l.pieces.map((x) => ({ colorName: findColor(p, x.color)?.name_ar ?? null, text: x.text, designName: x.designName })),
    );
  }
  return [variantText({ ...l, colorName: findColor(p, l.color)?.name_ar })];
}

/** The first uploaded design of a line (its own, or piece 1's): used as the line's thumbnail. */
export const lineThumbPath = (l: CartLine) => lineDesignPaths(l)[0];

export function LineDetails({ line, product }: { line: CartLine; product: Product }) {
  const rows = lineDetails(line, product);
  return (
    <span className="line-details">
      {rows.map((t, i) => (
        <span key={i} className="muted" data-piece={i > 0 && rows.length > 1 ? "" : undefined}>
          {t}
        </span>
      ))}
    </span>
  );
}
