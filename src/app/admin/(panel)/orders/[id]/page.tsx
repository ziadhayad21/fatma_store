import { DepositReview } from "@/components/admin/DepositReview";
import { colorLabel, DEPOSIT_LABEL, PROOF_BUCKET, getItemCustomizationNote, type DepositStatus } from "@/lib/product-rules";
import { roundMoney } from "@/lib/pricing/discount";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderInvoice, type InvoiceItem } from "@/components/admin/OrderInvoice";
import { PrintInvoiceButton } from "@/components/admin/PrintInvoiceButton";
import { StatusForm } from "@/components/admin/StatusForm";
import { Icon } from "@/components/ui/Icon";
import { requireAdmin } from "@/lib/admin/auth";
import { formatDate, whatsappUrl } from "@/lib/admin/format";
import { formatPrice } from "@/lib/format";
import { fontCss, fontLabel } from "@/lib/name-fonts";
import { isOrderStatus, STATUS_AR } from "@/lib/order-status";
import { paymentMethods } from "@/lib/payments";
import type { ProductImage } from "@/lib/types";
import "./invoice.css";

export const metadata = { title: "تفاصيل الطلب" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Item = InvoiceItem & {
  product_id: string | null;
  design_path: string | null;
};

export default async function OrderDetail({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase } = await requireAdmin();

  const { data } = await supabase.from("orders")
    .select("id, number, status, return_reason, created_at, customer_name, phone, governorate, area, address, notes, payment_method, subtotal, shipping, total, customization_notes, deposit_amount, deposit_status, deposit_method, payment_proof_path, order_items(*)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const status = String(data.status);
  const statusLabel = isOrderStatus(status) ? STATUS_AR[status] : status;
  const items = (data.order_items as Item[]).slice().sort((a, b) => a.name_snapshot.localeCompare(b.name_snapshot, "ar"));

  // product photos for the standard / name lines
  const ids = [...new Set(items.map((i) => i.product_id).filter((x): x is string => !!x))];
  const { data: prods } = ids.length
    ? await supabase.from("products").select("id, slug, images").in("id", ids)
    : { data: [] as { id: string; slug: string; images: ProductImage[] }[] };
  const photo = new Map((prods ?? []).map((p) => [p.id, { slug: p.slug, img: (p.images as ProductImage[])?.[0] }]));

  // customer uploads live in the private bucket: signed URLs are created with the signed-in admin session
  // (the storage policy only lets admins do this)
  const designs = new Map<string, { view?: string; download?: string }>();
  await Promise.all(
    items
      .filter((i) => i.design_path)
      .map(async (i, n) => {
        const ext = i.design_path!.split(".").pop() ?? "png";
        const filename = `order-${data.number}-design-${n + 1}.${ext}`;
        const [view, dl] = await Promise.all([
          supabase.storage.from("designs").createSignedUrl(i.design_path!, 3600),
          supabase.storage.from("designs").createSignedUrl(i.design_path!, 3600, { download: filename }),
        ]);
        designs.set(i.id, { view: view.data?.signedUrl, download: dl.data?.signedUrl });
      }),
  );

  const proof = data.payment_proof_path ? await supabase.storage.from(PROOF_BUCKET).createSignedUrl(data.payment_proof_path, 3600) : null;
  const pay = paymentMethods.find((m) => m.id === data.payment_method)?.label ?? data.payment_method;

  return (
    <>
      <div className="adm-order-screen">
        <div className="adm-head">
          <div>
            <p className="adm-sub"><Link href="/admin/orders">← الطلبات</Link></p>
            <h1>طلب <bdi dir="ltr">#{data.number}</bdi> <span className="adm-badge" data-s={status}>{statusLabel}</span></h1>
            <p className="adm-sub">{formatDate(data.created_at)}</p>
          </div>
          <div className="adm-order-head-actions">
            <StatusForm id={data.id} status={status} />
            <PrintInvoiceButton />
          </div>
        </div>

        {status === "returned" && data.return_reason && (
          <section className="adm-card adm-return-reason" aria-labelledby="order-return-reason">
            <h2 id="order-return-reason" lang="en">Return Reason</h2>
            <p dir="auto">{data.return_reason}</p>
          </section>
        )}

        <div className="adm-grid adm-cols-2" style={{ alignItems: "start" }}>
          <section className="adm-card" aria-label="بيانات العميل">
            <h2>العميل</h2>
            <dl className="adm-dl">
              <dt>الاسم</dt><dd>{data.customer_name}</dd>
              <dt>الموبايل</dt>
              <dd>
                <a href={`tel:${data.phone}`} dir="ltr">{data.phone}</a>{" "}
                · <a href={whatsappUrl(data.phone)} target="_blank" rel="noreferrer">واتساب ↗</a>
              </dd>
              <dt>المحافظة</dt><dd>{data.governorate}</dd>
              <dt>المنطقة</dt><dd>{data.area}</dd>
              <dt>العنوان</dt><dd>{data.address}</dd>
              {data.notes && (<><dt>ملاحظات</dt><dd>{data.notes}</dd></>)}
              {data.customization_notes && <><dt>ملاحظات التخصيص (الفوط والمريلات)</dt><dd style={{ whiteSpace: "pre-wrap" }}>{data.customization_notes}</dd></>}
              <dt>الدفع</dt><dd>{pay}</dd>
            </dl>
          </section>

          <section className="adm-card" aria-label="الحساب">
            <h2>الحساب</h2>
            <dl className="adm-dl">
              <dt>المنتجات</dt><dd>{formatPrice(Number(data.subtotal))}</dd>
              <dt>الشحن</dt><dd>{formatPrice(Number(data.shipping))}</dd>
              <dt><b>الإجمالي</b></dt><dd><b>{formatPrice(Number(data.total))}</b> {data.deposit_status ? "" : "(يُدفع عند الاستلام)"}</dd>
            </dl>
          </section>
        </div>

        {data.deposit_status && <section className="adm-card" style={{ marginTop: 16 }} aria-label="العربون">
          <h2>العربون</h2>
          <dl className="adm-dl">
            <dt>الحالة</dt><dd>{DEPOSIT_LABEL[data.deposit_status as DepositStatus]}</dd>
            <dt>العربون المطلوب (30%)</dt><dd>{formatPrice(Number(data.deposit_amount))}</dd>
            <dt>المتبقي بعد تأكيد العربون</dt><dd>{formatPrice(roundMoney(Number(data.total) - Number(data.deposit_amount)))}</dd>
            <dt>المبلغ المستحق حاليًا</dt><dd>{formatPrice(roundMoney(Number(data.total) - (data.deposit_status === "confirmed" ? Number(data.deposit_amount) : 0)))}</dd>
            <dt>طريقة التحويل</dt><dd>{data.deposit_method === "instapay" ? "InstaPay" : "Wallet"}</dd>
          </dl>
          {proof?.data?.signedUrl ? (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
              <a
                href={proof.data.signedUrl}
                target="_blank"
                rel="noreferrer"
                style={{ display: "inline-block", maxWidth: "100%", borderRadius: 10, overflow: "hidden", border: "1px solid var(--adm-side-border)", background: "#fff", padding: 4 }}
                title="فتح إثبات التحويل بالحجم الكامل"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
                <img src={proof.data.signedUrl} alt="إثبات تحويل العربون" style={{ maxWidth: "100%", maxHeight: 320, objectFit: "contain", display: "block", borderRadius: 6 }} />
              </a>
              <a
                href={proof.data.signedUrl}
                target="_blank"
                rel="noreferrer"
                className="adm-btn ghost"
                style={{ textDecoration: "none" }}
              >
                <Icon name="eye" size={17} />
                <span>فتح إثبات التحويل بالحجم الكامل</span>
              </a>
            </div>
          ) : <p>إثبات التحويل غير متاح.</p>}
          {data.deposit_status === "submitted" && <DepositReview id={data.id} />}
        </section>}
        <section className="adm-card" style={{ marginTop: 16 }} aria-label="المنتجات">
          <h2>المنتجات ({items.reduce((a, i) => a + i.qty, 0)} قطعة)</h2>
          {items.map((it) => {
            const d = designs.get(it.id);
            const p = it.product_id ? photo.get(it.product_id) : undefined;
            const itemNote = getItemCustomizationNote(data.customization_notes, it, items, p?.slug);
            return (
              <div className="adm-item" key={it.id}>
                {it.mode === "design" && d?.view ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL, not optimizable
                  <img className="design-img" src={d.view} alt="تصميم العميل" width={96} height={128} />
                ) : p?.img ? (
                  <Image src={p.img.src} alt="" width={96} height={128} style={{ objectPosition: p.img.position }} />
                ) : (
                  <span style={{ width: 96, height: 128, background: "var(--image)" }} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div><b>{it.name_snapshot}</b> <span className="adm-sub">× {it.qty}</span></div>
                  {it.color && <div className="adm-sub">اللون: {colorLabel(it)}</div>}
                  {it.mode === "standard" && <div className="adm-sub">زي ما هو (من غير تخصيص)</div>}
                  {it.mode === "name" && (
                    <div style={{ marginTop: 8 }}>
                      <div className="adm-sub"><b>نوع التخصيص:</b> كتابة الاسم{it.font ? ` (خط ${fontLabel(it.font)})` : ""}</div>
                      <span className="adm-nameprint" style={{ fontFamily: fontCss(it.font) }}>{it.text}</span>
                      <div className="adm-hint" dir="ltr" style={{ textAlign: "right" }}>{it.text}</div>
                      {itemNote && (
                        <div className="adm-customization-note">
                          <span className="adm-customization-note-title">ملاحظات التخصيص:</span>
                          <span className="adm-customization-note-text">{itemNote}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {it.mode === "design" && (
                    <div style={{ marginTop: 8 }}>
                      <div className="adm-sub"><b>نوع التخصيص:</b> تصميم العميل (رفع تصميم خاص)</div>
                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        {d?.download ? (
                          <a className="adm-btn sm" href={d.download} style={{ textDecoration: "none" }}>تحميل الملف</a>
                        ) : (
                          <div className="adm-err">الملف مش متاح (اتمسح أو حصلت مشكلة).</div>
                        )}
                        {d?.view && (
                          <a className="adm-hint" href={d.view} target="_blank" rel="noreferrer" style={{ display: "inline-block" }}>
                            فتح الصورة بالحجم الكامل ↗ (الرابط صالح لساعة)
                          </a>
                        )}
                      </div>
                      {itemNote && (
                        <div className="adm-customization-note">
                          <span className="adm-customization-note-title">ملاحظات التخصيص:</span>
                          <span className="adm-customization-note-text">{itemNote}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "end" }}>
                  <div>{formatPrice(Number(it.unit_price) * it.qty)}</div>
                  <div className="adm-hint">{formatPrice(Number(it.unit_price))} للقطعة</div>
                </div>
              </div>
            );
          })}
        </section>
      </div>
      <OrderInvoice order={data} items={items} />
    </>
  );
}
