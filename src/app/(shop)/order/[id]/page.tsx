import { colorLabel, DEPOSIT_LABEL, type ProductColor, type DepositStatus } from "@/lib/product-rules";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PriceDisplay } from "@/components/shop/PriceDisplay";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { itemOptionLine, itemPieceLines } from "@/lib/admin/order-item";
import type { StoredPiece } from "@/lib/couples";
import { fontLabel } from "@/lib/name-fonts";
import { formatPrice } from "@/lib/format";
import { isOrderStatus, STATUS_AR } from "@/lib/order-status";
import { paymentMethods } from "@/lib/payments";
import { roundMoney } from "@/lib/pricing/discount";
import { backendConfigured, createServiceClient } from "@/lib/supabase/admin";
import type { FontId, ProductImage } from "@/lib/types";

export const metadata: Metadata = { title: "تم استلام طلبك", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function OrderPage(props: PageProps<"/order/[id]">) {
  return (
    <Suspense fallback={<div className="wrap" style={{ minHeight: 600 }} aria-busy="true" />}>
      <OrderContent {...props} />
    </Suspense>
  );
}

type OrderRow = {
  id: string;
  number: number;
  customer_name: string;
  phone: string;
  governorate: string;
  area: string;
  address: string;
  notes: string | null;
  customization_notes: string | null;
  deposit_amount: number;
  deposit_percent?: number | null;
  deposit_status: DepositStatus | null;
  payment_method: string;
  status: string;
  subtotal: number;
  shipping: number;
  total: number;
  created_at: string;
  order_items: {
    id: string;
    product_id: string | null;
    product_image_snapshot?: ProductImage | null;
    name_snapshot: string;
    mode: "standard" | "name" | "design";
    text: string | null;
    font: FontId | null;
    color: ProductColor | null;
    color_name?: string | null;
    design_path: string | null;
    pieces?: StoredPiece[] | null;
    unit_price: number;
    original_unit_price?: number | string | null;
    discount_percent?: number | string | null;
    qty: number;
  }[];
};

async function OrderContent({ params }: PageProps<"/order/[id]">) {
  const { id } = await params;
  if (!UUID.test(id) || !backendConfigured()) notFound();

  // The order id is an unguessable UUID (the capability to view this page); read with the service role.
  const sb = createServiceClient();
  const { data } = await sb.from("orders")
    .select("id, number, customer_name, phone, governorate, area, address, notes, payment_method, status, subtotal, shipping, total, created_at, customization_notes, deposit_amount, deposit_status, order_items(*)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const order = data as unknown as OrderRow;

  // Before the migration is applied, older responses have no snapshot field.
  const legacyProductIds = [...new Set(order.order_items
    .filter((item) => item.product_image_snapshot === undefined)
    .map((item) => item.product_id)
    .filter((productId): productId is string => !!productId))];
  const legacyPhotos = new Map<string, ProductImage>();
  if (legacyProductIds.length) {
    const { data: products } = await sb.from("products").select("id, images").in("id", legacyProductIds);
    for (const product of products ?? []) {
      const photo = (product.images as ProductImage[] | null)?.[0];
      if (photo?.src) legacyPhotos.set(product.id, photo);
    }
  }

  const designPaths = order.order_items.flatMap((i) => [i.design_path, ...(i.pieces ?? []).map((pc) => pc.design_path)]).filter((p): p is string => !!p);
  const urls: Record<string, string> = {};
  if (designPaths.length) {
    const { data: signed } = await sb.storage.from("designs").createSignedUrls(designPaths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
  }
  const pay = paymentMethods.find((m) => m.id === order.payment_method);

  return (
    <div className="wrap" style={{ paddingBlock: "56px 112px" }}>
      <div className="order-box">
        <div className="rise" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center", marginBottom: 48 }}>
          <span className="ok-mark"><Icon name="check" size={30} /></span>
          <span className="eyebrow">طلب رقم</span>
          <h1 style={{ fontSize: "clamp(36px, 4vw, 56px)" }} dir="ltr">#{order.number}</h1>
          {order.deposit_status && <p role="status">{DEPOSIT_LABEL[order.deposit_status]}{order.deposit_status !== "confirmed" && " — الطلب لا يتأكد إلا بعد مراجعة الإدارة للتحويل."}</p>}
          <p className="muted" style={{ margin: 0, fontSize: 16 }}>وصلنا طلبك. احتفظ برقم الطلب للرجوع إليه.</p>
        </div>

        <section aria-label="المنتجات">
          {order.order_items.map((it) => {
            const photo = it.product_image_snapshot === undefined && it.product_id
              ? legacyPhotos.get(it.product_id)
              : it.product_image_snapshot;
            const design = it.design_path ? urls[it.design_path] : undefined;
            return (
              <div className="order-row" key={it.id}>
                {photo?.src ? (
                  <Image className="order-product-image" src={photo.src} alt={photo.alt || it.name_snapshot} width={72} height={96} style={{ objectPosition: photo.position }} />
                ) : (
                  <span className="order-product-image" aria-hidden="true" />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{it.name_snapshot} <span className="muted">× {it.qty}</span></div>
                  {it.pieces?.length ? (
                    <div className="line-details">
                      <span className="muted">{itemOptionLine(it)}</span>
                      {itemPieceLines(it).map((line, k) => (
                        <span className="muted" data-piece="" key={k}>{line}</span>
                      ))}
                    </div>
                  ) : (
                  <div className="muted" style={{ fontSize: 13, overflowWrap: "anywhere" }}>
                    {it.mode === "name"
                      ? `باسم «${it.text}»${it.font ? ` — خط ${fontLabel(it.font)}` : ""}`
                      : it.mode === "design"
                        ? "بتصميمك"
                        : "زي ما هو"}
                    {it.color && ` — اللون: ${colorLabel(it)}`}
                  </div>
                  )}
                  {it.pieces?.some((pc) => pc.design_path && urls[pc.design_path]) && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      {it.pieces.map((pc, k) => pc.design_path && urls[pc.design_path] ? (
                        <a key={k} className="order-design-preview" href={urls[pc.design_path]} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, not optimizable */}
                          <img src={urls[pc.design_path]} alt="" width={28} height={28} />
                          تصميم {pc.label}
                        </a>
                      ) : null)}
                    </div>
                  )}
                  {!it.pieces?.length && design && (
                    <a className="order-design-preview" href={design} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, not optimizable */}
                      <img src={design} alt="" width={28} height={28} />
                      عرض التصميم
                    </a>
                  )}
                </div>
                <PriceDisplay
                  price={roundMoney(Number(it.unit_price) * it.qty)}
                  originalPrice={it.original_unit_price == null ? null : roundMoney(Number(it.original_unit_price) * it.qty)}
                  discountPercent={it.discount_percent == null ? null : Number(it.discount_percent)}
                />
              </div>
            );
          })}
        </section>

        <div className="sum" style={{ position: "static", marginTop: 32 }}>
          <div className="sl"><span className="muted">المنتجات</span><span className="price">{formatPrice(Number(order.subtotal))}</span></div>
          <div className="sl"><span className="muted">الشحن</span><span className="price">{formatPrice(Number(order.shipping))}</span></div>
          <div style={{ height: 1, background: "#dcd8d1" }} />
          <div className="sl" style={{ fontSize: 18 }}><span>الإجمالي</span><span>{formatPrice(Number(order.total))}</span></div>
        </div>

        {order.deposit_status && <div className="sum" style={{ position: "static", marginTop: 24 }}>
          <div className="sl"><span>العربون المطلوب ({order.deposit_percent ?? 50}%)</span><span>{formatPrice(Number(order.deposit_amount))}</span></div>
          <div className="sl"><span>العربون المدفوع والمؤكد</span><span>{formatPrice(order.deposit_status === "confirmed" ? Number(order.deposit_amount) : 0)}</span></div>
          <div className="sl"><span>المتبقي بعد تأكيد العربون</span><span>{formatPrice(roundMoney(Number(order.total) - Number(order.deposit_amount)))}</span></div>
        </div>}
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 24px", margin: "40px 0 0", fontSize: 15 }}>
          <dt className="muted">الاسم</dt><dd style={{ margin: 0 }}>{order.customer_name}</dd>
          <dt className="muted">الموبايل</dt><dd style={{ margin: 0 }} dir="ltr" lang="en" >{order.phone}</dd>
          <dt className="muted">العنوان</dt><dd style={{ margin: 0 }}>{order.governorate} — {order.area} — {order.address}</dd>
          {order.customization_notes && <><dt className="muted">ملاحظات التخصيص (الفوط والمريلات)</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{order.customization_notes}</dd></>}
          {order.notes && (<><dt className="muted">ملاحظات</dt><dd style={{ margin: 0 }}>{order.notes}</dd></>)}
          <dt className="muted">الدفع</dt><dd style={{ margin: 0 }}>{pay?.label ?? order.payment_method}</dd>
          <dt className="muted">الحالة</dt><dd style={{ margin: 0 }}>{isOrderStatus(order.status) ? STATUS_AR[order.status] : order.status}</dd>
        </dl>

        <div style={{ marginTop: 48, textAlign: "center" }}>
          <Button href="/" variant="l">ارجع للرئيسية</Button>
        </div>
      </div>
    </div>
  );
}
