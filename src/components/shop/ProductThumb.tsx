import Image from "next/image";
import type { Product } from "@/lib/types";
import { DiyIllustration, diyKind } from "./DiyIllustration";

/**
 * Small product picture for the cart, drawer and checkout summary: the first photo, or (a product
 * without photos, e.g. a DIY one) its outline illustration on the soft tint.
 */
export function ProductThumb({ product: p, width, height }: { product: Product; width: number; height: number }) {
  const img = p.images[0];
  if (img) return <Image src={img.src} alt="" width={width} height={height} style={{ objectPosition: img.position }} />;
  const kind = diyKind(p.category_slug);
  return (
    <span className="thumb-diy" data-kind={kind} style={{ width, height }} aria-hidden="true">
      <DiyIllustration kind={kind} />
    </span>
  );
}
