import Link from "next/link";
import { fromPrice } from "@/lib/pricing/discount";
import type { Product } from "@/lib/types";
import { DiyIllustration, diyKind } from "./DiyIllustration";
import { PriceDisplay } from "./PriceDisplay";

/**
 * "اصنعها بنفسك": the first card of a collection. An outline of the blank item instead of a photo,
 * and one link to the normal product page (where only "your name" / "your design" are offered).
 */
export function DiyCard({ product: p, className }: { product: Product; className?: string }) {
  const kind = diyKind(p.category_slug);
  const price = fromPrice(p);
  return (
    <article dir="rtl" className={`diy-card-wrap w-full max-w-full min-w-0 text-right lg:w-[280px]${className ? " " + className : ""}`}>
      <Link href={`/products/${p.slug}`} className="diy-card" data-kind={kind}>
        <div className="diy-stage">
          <span className="diy-badge">اصنعها بنفسك</span>
          <DiyIllustration kind={kind} />
        </div>
        <div className="diy-body">
          <h2 className="diy-title">{p.name_ar}</h2>
          <p className="diy-line">ارفع تصميمك واكتب الاسم اللي تحبه</p>
          <div className="diy-price">
            <PriceDisplay {...price} from={price.from || p.has_colors} showBadge={false} />
          </div>
          <span className="diy-cta">ابدأ دلوقتي</span>
        </div>
      </Link>
    </article>
  );
}
