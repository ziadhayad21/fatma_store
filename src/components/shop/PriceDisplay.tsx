import type { CSSProperties } from "react";
import { formatPrice } from "@/lib/format";
import type { PriceBreakdown } from "@/lib/pricing/discount";

export function PriceDisplay({
  price,
  originalPrice,
  discountPercent,
  className,
  style,
  showBadge = true,
}: PriceBreakdown & {
  className?: string;
  style?: CSSProperties;
  showBadge?: boolean;
}) {
  const classes = ["price", className].filter(Boolean).join(" ");
  if (originalPrice === null || discountPercent === null) {
    return <span className={classes} style={style}>{formatPrice(price)}</span>;
  }
  return (
    <span className={`${classes} sale-price`} style={style}>
      <strong className="sale-final">{formatPrice(price)}</strong>
      <del className="sale-original">{formatPrice(originalPrice)}</del>
      {showBadge && <span className="sale-badge">خصم {discountPercent}%</span>}
    </span>
  );
}
