"use client";

import Link from "next/link";
import { useCartProducts } from "@/components/cart/useCartProducts";
import { useDesignUrls } from "@/components/cart/useDesignUrls";
import { PriceDisplay } from "@/components/shop/PriceDisplay";
import { ProductThumb } from "@/components/shop/ProductThumb";
import { removeCartLine } from "@/lib/cart-actions";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Icon } from "@/components/ui/Icon";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { formatPrice } from "@/lib/format";
import { LineDetails, lineThumbPath } from "@/components/cart/LineDetails";
import { lineDesignPaths } from "@/lib/couples";
import { productPrice, roundMoney } from "@/lib/pricing/discount";
import { useCart } from "@/store/cart";
import { useUI } from "@/store/ui";

export function CartDrawer() {
  const open = useUI((s) => s.cartOpen);
  const closeAll = useUI((s) => s.closeAll);
  const storedLines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const { products } = useCartProducts(open);
  const designUrls = useDesignUrls(storedLines.flatMap(lineDesignPaths));

  const lines = storedLines.filter((l) => products.has(l.productId));
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const subtotal = roundMoney(lines.reduce((a, l) => a + productPrice(products.get(l.productId)!, { color: l.color, qty: l.qty }).price, 0));

  return (
    <Drawer open={open} onClose={closeAll} side="left" label="سلة التسوق">
      <div className="dr-h">
        <span style={{ fontSize: 18, fontWeight: 500 }}>
          سلة التسوق <span className="muted" style={{ fontSize: 15 }}>({count})</span>
        </span>
        <button type="button" className="ib" aria-label="إغلاق السلة" onClick={closeAll}>
          <Icon name="close" size={20} />
        </button>
      </div>

      {lines.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 40, textAlign: "center" }}>
          <span style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--image)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="bag" size={21} />
          </span>
          <span style={{ fontSize: 20, fontWeight: 500 }}>سلتك لسه فاضية</span>
          <span className="muted" style={{ fontSize: 14 }}>اختار منتج واطلبه زي ما هو، أو باسمك، أو بتصميمك.</span>
          <Button href="/#categories" onClick={closeAll}>
            تسوّق المنتجات
          </Button>
        </div>
      ) : (
        <>
          <ul className="dr-list" style={{ listStyle: "none", margin: 0 }}>
            {lines.map((l) => {
              const p = products.get(l.productId)!;
              const thumbPath = lineThumbPath(l);
              const thumb = thumbPath ? designUrls[thumbPath] : undefined;
              return (
                <li className="dr-row" key={l.key}>
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URL, not optimizable
                    <img className="thumb-d" src={thumb} alt="التصميم اللي رفعته" width={84} height={112} />
                  ) : (
                    <ProductThumb product={p} width={84} height={112} />
                  )}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
                      <Link href={`/products/${p.slug}`} className="card-name" onClick={closeAll}>
                        {p.name_ar}
                      </Link>
                      <PriceDisplay {...productPrice(p, { color: l.color, qty: l.qty })} />
                    </div>
                    <LineDetails line={l} product={p} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
                      <QtyStepper value={l.qty} onChange={(n) => setQty(l.key, n)} />
                      <button type="button" className="rm" onClick={() => removeCartLine(l.key)}>
                        شيل
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="dr-f">
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16 }}>
              <span>الإجمالي الفرعي</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <span className="muted" style={{ fontSize: 13 }}>الشحن بيتحسب في خطوة الدفع.</span>
            <Button href="/checkout" block onClick={closeAll}>
              إتمام الطلب
            </Button>
            <Button variant="l" block onClick={closeAll}>
              كمّل تسوّق
            </Button>
          </div>
        </>
      )}
    </Drawer>
  );
}
