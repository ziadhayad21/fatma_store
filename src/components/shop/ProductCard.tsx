"use client";

import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Tile } from "@/components/ui/Tile";
import { fromPrice } from "@/lib/pricing/discount";
import { productRules } from "@/lib/product-rules";
import type { Product } from "@/lib/types";
import { useCart } from "@/store/cart";
import { useUI } from "@/store/ui";
import { useWishlist } from "@/store/wishlist";
import { DiyCard } from "./DiyCard";
import { PriceDisplay } from "./PriceDisplay";

type Props = {
  product: Product;
  /** `sizes` hint for next/image — depends on the grid the card sits in */
  sizes?: string;
  priority?: boolean;
  className?: string;
  variant?: "standard" | "listing";
};

const listingButton = "absolute flex size-7 cursor-pointer items-center justify-center rounded-full bg-white/95 text-[#292524] shadow-sm transition lg:size-8";

export function ProductCard({
  product: p,
  sizes = "(max-width: 900px) 100vw, 450px",
  priority,
  className,
  variant = "standard",
}: Props) {
  const wished = useWishlist((s) => s.slugs.includes(p.slug));
  const toggleWish = useWishlist((s) => s.toggle);
  const add = useCart((s) => s.add);
  const openCart = useUI((s) => s.openCart);
  const [main] = p.images;
  const href = `/products/${p.slug}`;
  const price = fromPrice(p);
  const rules = productRules(p);
  // quick add uses the first available colour; a colour product with none left opens its page instead
  const quickAddColor = rules.colors ? p.colors[0]?.id ?? null : null;
  const canQuickAdd = !rules.colors || quickAddColor !== null;

  // "اصنعها بنفسك": its own card (outline illustration, no quick add: it needs a name or a design)
  if (p.is_diy && !rules.standard) return <DiyCard product={p} className={className} />;

  if (variant === "listing") {
    return (
      <article dir="rtl" className={`w-full max-w-full min-w-0 text-right lg:w-[280px]${className ? " " + className : ""}`}>
        <div className="relative aspect-[7/8] w-full overflow-hidden rounded-[12px] bg-image lg:rounded-[16px]">
          <Link href={href} className="absolute inset-0 focus-visible:-outline-offset-2" aria-label={p.name_ar}>
            {main && (
              <Image src={main.src} alt={main.alt} fill sizes={sizes} priority={priority} className="object-cover" style={{ objectPosition: main.position }} />
            )}
          </Link>
          {price.discountPercent !== null && (
            <span className="pointer-events-none absolute top-2 right-2 z-[2] rounded-full bg-[#c1121f] px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm lg:top-3 lg:right-3 lg:text-[11px]">
              خصم {price.discountPercent}%
            </span>
          )}
          <button
            type="button"
            className={`${listingButton} listing-product-wish top-2 left-2 hover:bg-white lg:top-3 lg:left-3`}
            aria-label={wished ? "إزالة من المفضلة" : "إضافة للمفضلة"}
            aria-pressed={wished}
            onClick={() => toggleWish(p.slug)}
          >
            <Icon name="heart" size={16} />
          </button>
          {canQuickAdd && (
            <button
              type="button"
              className={`${listingButton} right-2 bottom-2 hover:bg-[#292524] hover:text-white lg:right-3 lg:bottom-3`}
              aria-label="أضف للسلة"
              onClick={() => {
                add({ productId: p.slug, mode: "standard", text: null, font: null, designPath: null, designName: null, color: quickAddColor });
                openCart();
              }}
            >
              <Icon name="plus" size={16} />
            </button>
          )}
        </div>
        {rules.customization && <span className="mt-2.5 inline-block rounded-md bg-[#E8EFE5] px-2 py-0.5 text-[10px] font-medium text-[#4B5E45] lg:mt-3 lg:text-[11px]">+ قابل للطباعة</span>}
        <h2 className="listing-product-title line-clamp-1">
          <Link href={href}>{p.name_ar}</Link>
        </h2>
        <div className="listing-product-price mt-0.5 text-[13px] text-[#292524] lg:mt-1 lg:text-[15px]"><PriceDisplay {...price} /></div>
        {rules.customization && <span className="mt-1 flex items-center gap-1 text-[10px] font-normal text-stone-400 lg:text-[11px]">
          <span className="size-2 rounded-full border border-current" aria-hidden="true" />
          أضف اسمك
        </span>}
      </article>
    );
  }

  return (
    <div className={`tile-wrapper${className ? " " + className : ""}`}>
      <Tile
        className="dept-card"
        href={href}
        src={main.src}
        alt={main.alt}
        position={main.position}
        title={p.name_ar}
        sizes={sizes}
        priority={priority}
        custom={
          <>
            <span className={`dept-badge dept-price-badge ${price.discountPercent === null ? "dept-badge-1" : "dept-price-discount"}`}>
              <PriceDisplay {...price} />
            </span>
            <span className="dept-shop">Shop ←</span>
            <h3 className="dept-title">{p.name_ar}</h3>
          </>
        }
      />
      <button
        type="button"
        className={`dept-wish-btn${wished ? " on" : ""}`}
        aria-label={wished ? "إزالة من المفضلة" : "إضافة للمفضلة"}
        aria-pressed={wished}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleWish(p.slug);
        }}
      >
        <Icon name="heart" size={16} />
      </button>
    </div>
  );
}
