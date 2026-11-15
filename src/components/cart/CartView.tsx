"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { TextLink } from "@/components/ui/TextLink";
import { formatPrice } from "@/lib/format";
import { unitPrice, variantText } from "@/lib/pricing";
import { useCart } from "@/store/cart";
import { useCartHydrated } from "@/store/useStoreHydrated";
import { removeCartLine } from "@/lib/cart-actions";
import { useCartProducts } from "./useCartProducts";
import { useDesignUrls } from "./useDesignUrls";

export function CartView() {
  const storedLines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const { products, loaded } = useCartProducts();
  const designUrls = useDesignUrls(storedLines.map((l) => l.designPath));

  const lines = storedLines.filter((l) => products.has(l.productId));
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const itemsTotal = lines.reduce((a, l) => a + products.get(l.productId)!.base_price * l.qty, 0);
  const printTotal = lines.reduce(
    (a, l) => a + (unitPrice(products.get(l.productId)!, l.mode) - products.get(l.productId)!.base_price) * l.qty,
    0,
  );

  const hydrated = useCartHydrated();
  const waiting = !hydrated || (storedLines.length > 0 && !loaded);
  const empty = !waiting && lines.length === 0;

  return (
    <div className="wrap" style={{ paddingBottom: 112 }}>
      <nav className="crumb crumb-pad" aria-label="مسار الصفحة">
        <Link href="/">الرئيسية</Link>
        <span aria-hidden="true">/</span>
        <span style={{ color: "var(--ink)" }}>سلة التسوق</span>
      </nav>
      <div className="rise" style={{ display: "flex", alignItems: "baseline", gap: 14, margin: "8px 0 40px" }}>
        <h1 style={{ fontSize: "clamp(36px, 4vw, 56px)" }}>سلة التسوق</h1>
        {!empty && !waiting && <span className="muted">{count === 1 ? "منتج واحد" : `${count} منتجات`}</span>}
      </div>

      {empty && (
        <div className="empty rise">
          <span style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--image)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="bag" size={21} />
          </span>
          <h2 style={{ fontSize: 26 }}>سلتك فاضية</h2>
          <p className="muted" style={{ margin: 0 }}>اختار من الفوط والمريلات والشنط — زي ما هي، أو باسمك، أو بتصميمك.</p>
          <Button href="/#shop">تسوّق المنتجات</Button>
        </div>
      )}

      {waiting && <div className="sk" style={{ height: 480 }} aria-busy="true" />}

      {!empty && !waiting && (
        <div className="cart">
          <div>
            <div className="thead">
              <span>المنتج</span>
              <span>الكمية</span>
              <span className="tot">الإجمالي</span>
            </div>
            {lines.map((l) => {
              const p = products.get(l.productId)!;
              const img = p.images[0];
              const unit = unitPrice(p, l.mode);
              const thumb = l.designPath ? designUrls[l.designPath] : undefined;
              return (
                <div className="row" key={l.key}>
                  <div style={{ display: "flex", gap: 18, alignItems: "center", minWidth: 0 }}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed URL, not optimizable
                      <img className="thumb-d" src={thumb} alt="التصميم اللي رفعته" width={96} height={128} />
                    ) : (
                      <Image src={img.src} alt="" width={96} height={128} style={{ objectPosition: img.position }} />
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                      <Link className="card-name" href={`/products/${p.slug}`} style={{ fontSize: 16 }}>{p.name_ar}</Link>
                      <span className="muted" style={{ fontSize: 13, overflowWrap: "anywhere" }}>{variantText(l)}</span>
                      <span className="price" style={{ fontSize: 14 }}>{formatPrice(unit)}</span>
                      <div style={{ display: "flex", gap: 16 }}>
                        <Link className="rm" href={`/products/${p.slug}?edit=${encodeURIComponent(l.key)}`} style={{ display: "inline-flex", alignItems: "center" }}>عدّل</Link>
                        <button type="button" className="rm" onClick={() => removeCartLine(l.key)}>شيل</button>
                      </div>
                    </div>
                  </div>
                  <QtyStepper value={l.qty} onChange={(n) => setQty(l.key, n)} />
                  <span className="price tot">{formatPrice(unit * l.qty)}</span>
                </div>
              );
            })}
            <TextLink href="/#shop" style={{ marginTop: 28 }}>كمّل تسوّق</TextLink>
          </div>

          <aside className="sum rise d2" aria-label="ملخص الطلب">
            <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>ملخص الطلب</h2>
            <div className="sl"><span className="muted">المنتجات ({count})</span><span className="price">{formatPrice(itemsTotal)}</span></div>
            <div className="sl"><span className="muted">الطباعة والتخصيص</span><span className="price">{formatPrice(printTotal)}</span></div>
            <div className="sl"><span className="muted">الشحن</span><span style={{ fontSize: 14 }}>بيتحسب في الخطوة الجاية</span></div>
            <div style={{ height: 1, background: "#dcd8d1" }} />
            <div className="sl" style={{ fontSize: 18 }}><span>الإجمالي</span><span>{formatPrice(itemsTotal + printTotal)}</span></div>
            <Button href="/checkout" arrow block>إتمام الطلب</Button>
          </aside>
        </div>
      )}
    </div>
  );
}
