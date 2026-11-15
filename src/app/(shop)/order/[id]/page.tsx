import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { fontLabel } from "@/lib/name-fonts";
import { formatPrice } from "@/lib/format";
import { paymentMethods } from "@/lib/payments";
import { backendConfigured, createServiceClient } from "@/lib/supabase/admin";
import type { FontId } from "@/lib/types";

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
  payment_method: string;
  status: string;
  subtotal: number;
  shipping: number;
  total: number;
  created_at: string;
  order_items: {
    id: string;
    product_id: string | null;
    name_snapshot: string;
    mode: "standard" | "name" | "design";
    text: string | null;
    font: FontId | null;
    design_path: string | null;
    unit_price: number;
    qty: number;
  }[];
};

const STATUS_AR: Record<string, string> = {
  new: "جديد",
  confirmed: "اتأكد",
  printing: "تحت الطباعة",
  shipped: "اتشحن",
  delivered: "اتسلّم",
  cancelled: "اتلغى",
};

async function OrderContent({ params }: PageProps<"/order/[id]">) {
  const { id } = await params;
  if (!UUID.test(id) || !backendConfigured()) notFound();

  // The order id is an unguessable UUID (the capability to view this page); read with the service role.
  const sb = createServiceClient();
  const { data } = await sb.from("orders").select("*, order_items(*)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const order = data as unknown as OrderRow;

  const designPaths = order.order_items.map((i) => i.design_path).filter((p): p is string => !!p);
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
          <p className="muted" style={{ margin: 0, fontSize: 16 }}>وصلنا طلبك. احتفظ برقم الطلب للرجوع إليه.</p>
        </div>

        <section aria-label="المنتجات">
          {order.order_items.map((it) => (
            <div className="order-row" key={it.id}>
              {it.design_path && urls[it.design_path] ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL, not optimizable
                <img src={urls[it.design_path]} alt="التصميم اللي رفعته" width={72} height={96} style={{ objectFit: "contain" }} />
              ) : (
                <Image src="/brand/logo-mark.png" alt="" width={72} height={96} style={{ objectFit: "contain", padding: 10 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{it.name_snapshot} <span className="muted">× {it.qty}</span></div>
                <div className="muted" style={{ fontSize: 13, overflowWrap: "anywhere" }}>
                  {it.mode === "name"
                    ? `باسم «${it.text}» — خط ${fontLabel(it.font)}`
                    : it.mode === "design"
                      ? "بتصميمك"
                      : "زي ما هو"}
                </div>
              </div>
              <span className="price">{formatPrice(Number(it.unit_price) * it.qty)}</span>
            </div>
          ))}
        </section>

        <div className="sum" style={{ position: "static", marginTop: 32 }}>
          <div className="sl"><span className="muted">المنتجات والتخصيص</span><span className="price">{formatPrice(Number(order.subtotal))}</span></div>
          <div className="sl"><span className="muted">الشحن</span><span className="price">{formatPrice(Number(order.shipping))}</span></div>
          <div style={{ height: 1, background: "#dcd8d1" }} />
          <div className="sl" style={{ fontSize: 18 }}><span>الإجمالي</span><span>{formatPrice(Number(order.total))}</span></div>
        </div>

        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 24px", margin: "40px 0 0", fontSize: 15 }}>
          <dt className="muted">الاسم</dt><dd style={{ margin: 0 }}>{order.customer_name}</dd>
          <dt className="muted">الموبايل</dt><dd style={{ margin: 0 }} dir="ltr" lang="en" >{order.phone}</dd>
          <dt className="muted">العنوان</dt><dd style={{ margin: 0 }}>{order.governorate} — {order.area} — {order.address}</dd>
          {order.notes && (<><dt className="muted">ملاحظات</dt><dd style={{ margin: 0 }}>{order.notes}</dd></>)}
          <dt className="muted">الدفع</dt><dd style={{ margin: 0 }}>{pay?.label ?? order.payment_method}</dd>
          <dt className="muted">الحالة</dt><dd style={{ margin: 0 }}>{STATUS_AR[order.status] ?? order.status}</dd>
        </dl>

        <div style={{ marginTop: 48, textAlign: "center" }}>
          <Button href="/" variant="l">ارجع للرئيسية</Button>
        </div>
      </div>
    </div>
  );
}
