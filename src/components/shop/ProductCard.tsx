"use client";

import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";
import { useCart } from "@/store/cart";
import { useUI } from "@/store/ui";
import { useWishlist } from "@/store/wishlist";

type Props = {
  product: Product;
  /** `sizes` hint for next/image — depends on the grid the card sits in */
  sizes?: string;
  priority?: boolean;
  className?: string;
};

export function ProductCard({ product: p, sizes = "(max-width: 900px) 50vw, 33vw", priority, className }: Props) {
  const wished = useWishlist((s) => s.slugs.includes(p.slug));
  const toggleWish = useWishlist((s) => s.toggle);
  const add = useCart((s) => s.add);
  const openCart = useUI((s) => s.openCart);
  const [main, alt] = p.images;

  return (
    <div className={`card${className ? " " + className : ""}`}>
      <div className="card-media">
        <Link href={`/products/${p.slug}`} aria-label={p.name_ar}>
          <Image className="main" src={main.src} alt={main.alt} fill sizes={sizes} priority={priority} style={{ objectPosition: main.position }} />
          {alt && <Image className="alt" src={alt.src} alt="" fill sizes={sizes} style={{ objectPosition: alt.position }} />}
        </Link>
        <span className="tag">متاح بالاسم</span>
        <button
          type="button"
          className={`wish${wished ? " on" : ""}`}
          aria-label={wished ? "إزالة من المفضلة" : "إضافة للمفضلة"}
          aria-pressed={wished}
          onClick={() => toggleWish(p.slug)}
        >
          <Icon name="heart" size={18} />
        </button>
        <button
          type="button"
          className="qa"
          onClick={() => {
            add({ productId: p.slug, mode: "standard", text: null, font: null, designPath: null, designName: null });
            openCart();
          }}
        >
          <Icon name="plus" size={14} />
          أضف للسلة
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="card-row">
          <Link className="card-name" href={`/products/${p.slug}`}>
            {p.name_ar}
          </Link>
          <span className="price">{formatPrice(p.base_price)}</span>
        </div>
        <span className="muted" style={{ fontSize: 13 }}>زي ما هو • باسمك • بتصميمك</span>
      </div>
    </div>
  );
}
