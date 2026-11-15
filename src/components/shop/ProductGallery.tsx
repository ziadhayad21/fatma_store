"use client";

import Image from "next/image";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ProductImage } from "@/lib/types";

/** Real product photos only — no design preview. */
export function ProductGallery({ images }: { images: ProductImage[] }) {
  const [i, setI] = useState(0);
  const n = images.length;
  const cur = images[i];
  const go = (d: number) => setI((x) => (x + d + n) % n);

  return (
    <div className="gal rise">
      {n > 1 && (
        <div className="thumbs" role="group" aria-label="صور المنتج">
          {images.map((img, k) => (
            <button
              key={img.src}
              type="button"
              className={`th${k === i ? " on" : ""}`}
              aria-label={`الصورة ${k + 1} من ${n}`}
              aria-pressed={k === i}
              onClick={() => setI(k)}
            >
              <Image src={img.src} alt="" fill sizes="84px" style={{ objectFit: "cover", objectPosition: img.position }} />
            </button>
          ))}
        </div>
      )}
      <div className="stage">
        <div className="stage-img" key={cur.src}>
          <Image
            src={cur.src}
            alt={cur.alt}
            fill
            priority={i === 0}
            sizes="(max-width: 1024px) 100vw, 600px"
            style={{ objectFit: "cover", objectPosition: cur.position }}
          />
        </div>
        {n > 1 && (
          <>
            <button type="button" className="nav-ar" style={{ insetInlineStart: 16 }} aria-label="الصورة السابقة" onClick={() => go(-1)}>
              <Icon name="chevronR" size={18} />
            </button>
            <button type="button" className="nav-ar" style={{ insetInlineEnd: 16 }} aria-label="الصورة التالية" onClick={() => go(1)}>
              <Icon name="chevronL" size={18} />
            </button>
            <span className="counter" dir="ltr" aria-live="polite">{`${i + 1} / ${n}`}</span>
          </>
        )}
      </div>
    </div>
  );
}
