import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DepositReview } from "@/components/admin/DepositReview";
import { OrderInvoice, type InvoiceItem } from "@/components/admin/OrderInvoice";
import { PrintInvoiceButton } from "@/components/admin/PrintInvoiceButton";
import { StatusForm } from "@/components/admin/StatusForm";
import { Icon } from "@/components/ui/Icon";
import { requireAdmin } from "@/lib/admin/auth";
import { formatDay, whatsappUrl } from "@/lib/admin/format";
import { itemOptionLine } from "@/lib/admin/order-item";
import { formatPrice } from "@/lib/format";
import { fontCss } from "@/lib/name-fonts";
import { isOrderStatus, STATUS_AR } from "@/lib/order-status";
import { paymentMethods } from "@/lib/payments";
import { roundMoney } from "@/lib/pricing/discount";
import { DEPOSIT_LABEL, PROOF_BUCKET, getItemCustomizationNote, type DepositStatus } from "@/lib/product-rules";
import type { ProductImage } from "@/lib/types";
import "./invoice.css";

export const metadata = { title: "تفاصيل الطلب" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEPOSIT_METHOD_AR: Record<string, string> = { instapay: "إنستاباي", wallet: "محفظة إلكترونية" };

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

  // money (same rules as before: the deposit counts as paid once an admin confirmed it)
  const total = Number(data.total);
  const deposit = Number(data.deposit_amount);
  const depositStatus = data.deposit_status as DepositStatus | null;
  const toCollect = roundMoney(total - (depositStatus === "confirmed" ? deposit : 0));
  const pieces = items.reduce((a, i) => a + i.qty, 0);

  // customization notes are shown on their item; anything that could not be matched is shown once below the items
  const notes = new Map(items.map((it) => [it.id, getItemCustomizationNote(data.customization_notes, it, items, it.product_id ? photo.get(it.product_id)?.slug : undefined)]));
  const unmatchedNotes = data.customization_notes?.trim() && ![...notes.values()].some(Boolean) ? data.customization_notes.trim() : null;

  return (
    <>
      <div className="adm-order-screen adm-od">
        <header className="adm-od-head">
          <div className="adm-od-title">
            <Link href="/admin/orders" className="adm-od-back">← الطلبات</Link>
            <div className="adm-od-title-row">
              <h1>طلب <bdi dir="ltr">#{data.number}</bdi></h1>
              <span className="adm-pill" data-s={status}>{statusLabel}</span>
            </div>
            <time className="adm-sub" dateTime={data.created_at}>{formatDay(data.created_at)}</time>
          </div>
          <div className="adm-od-actions">
            <StatusForm id={data.id} status={status} />
            <PrintInvoiceButton />
          </div>
        </header>

        <div className="adm-od-grid">
          <div className="adm-od-main">
            {status === "returned" && data.return_reason && (
              <section className="adm-card adm-od-return" aria-labelledby="od-return">
                <h2 id="od-return">سبب الإرجاع</h2>
                <p dir="auto">{data.return_reason}</p>
              </section>
            )}

            <section className="adm-card" aria-labelledby="od-items">
              <h2 id="od-items">المنتجات <span className="adm-od-count">{pieces} {pieces === 1 ? "قطعة" : "قطع"}</span></h2>
              <ul className="adm-od-items">
                {items.map((it) => {
                  const d = designs.get(it.id);
                  const img = it.product_image_snapshot ?? (it.product_id ? photo.get(it.product_id)?.img : undefined);
                  const note = notes.get(it.id);
                  const unit = Number(it.unit_price);
                  return (
                    <li className="adm-od-item" key={it.id}>
                      {it.mode === "design" && d?.view ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed URL, not optimizable
                        <img className="adm-od-thumb design" src={d.view} alt="تصميم العميل" width={72} height={96} />
                      ) : img?.src ? (
                        <Image className="adm-od-thumb" src={img.src} alt="" width={72} height={96} style={{ objectPosition: img.position }} />
                      ) : (
                        <span className="adm-od-thumb" aria-hidden="true" />
                      )}

                      <div className="adm-od-item-body">
                        <div className="adm-od-item-top">
                          <strong dir="auto">{it.name_snapshot}</strong>
                          <span className="adm-od-price">{formatPrice(roundMoney(unit * it.qty))}</span>
                        </div>
                        <div className="adm-od-item-meta">
                          <span>{itemOptionLine(it)}</span>
                          <span>
                            الكمية {it.qty}
                            {it.qty > 1 && <> · {formatPrice(unit)} للقطعة</>}
                          </span>
                        </div>

                        {it.mode === "name" && it.text && (
                          <span className="adm-nameprint" style={{ fontFamily: fontCss(it.font) }} dir="auto">{it.text}</span>
                        )}

                        {it.mode === "design" && (
                          <div className="adm-od-design">
                            {d?.download ? (
                              <a className="adm-btn sm" href={d.download}>
                                <Icon name="upload" size={15} /> تحميل التصميم
                              </a>
                            ) : (
                              <span className="adm-err">ملف التصميم مش متاح.</span>
                            )}
                            {d?.view && (
                              <a className="adm-od-link" href={d.view} target="_blank" rel="noreferrer">عرض بالحجم الكامل ↗</a>
                            )}
                          </div>
                        )}

                        {note && (
                          <p className="adm-od-note"><b>ملاحظة:</b> <span>{note}</span></p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {unmatchedNotes && (
                <p className="adm-od-note"><b>ملاحظات التخصيص:</b> <span>{unmatchedNotes}</span></p>
              )}
            </section>
          </div>

          <aside className="adm-od-side">
            <section className="adm-card" aria-labelledby="od-customer">
              <h2 id="od-customer">العميل</h2>
              <p className="adm-od-strong" dir="auto">{data.customer_name}</p>
              <p className="adm-od-phone"><bdi dir="ltr">{data.phone}</bdi></p>
              <div className="adm-od-contact">
                <a className="adm-btn ghost sm" href={`tel:${data.phone}`}>اتصال</a>
                <a className="adm-btn ghost sm" href={whatsappUrl(data.phone)} target="_blank" rel="noreferrer">واتساب ↗</a>
              </div>
            </section>

            <section className="adm-card" aria-labelledby="od-delivery">
              <h2 id="od-delivery">التوصيل</h2>
              <dl className="adm-od-dl">
                <dt>المحافظة</dt><dd>{data.governorate}</dd>
                <dt>العنوان</dt><dd dir="auto">{[data.area, data.address].filter(Boolean).join("، ")}</dd>
                {data.notes?.trim() && <><dt>ملاحظات</dt><dd dir="auto" className="adm-od-pre">{data.notes}</dd></>}
              </dl>
            </section>

            <section className="adm-card" aria-labelledby="od-payment">
              <h2 id="od-payment">الدفع</h2>
              <dl className="adm-od-dl adm-od-money">
                <dt>المنتجات</dt><dd>{formatPrice(Number(data.subtotal))}</dd>
                <dt>الشحن</dt><dd>{formatPrice(Number(data.shipping))}</dd>
                <dt className="total">الإجمالي</dt><dd className="total">{formatPrice(total)}</dd>
                {depositStatus && (
                  <>
                    <dt>العربون (30%)</dt>
                    <dd>{formatPrice(deposit)}</dd>
                    <dt>حالة العربون</dt>
                    <dd><span className="adm-pill" data-d={depositStatus}>{DEPOSIT_LABEL[depositStatus]}</span></dd>
                    {data.deposit_method && DEPOSIT_METHOD_AR[data.deposit_method] && (
                      <><dt>التحويل</dt><dd>{DEPOSIT_METHOD_AR[data.deposit_method]}</dd></>
                    )}
                  </>
                )}
              </dl>

              {proof?.data?.signedUrl && (
                <a className="adm-od-proof" href={proof.data.signedUrl} target="_blank" rel="noreferrer" title="فتح إثبات التحويل بالحجم الكامل">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
                  <img src={proof.data.signedUrl} alt="إثبات تحويل العربون" />
                  <span>إثبات التحويل ↗</span>
                </a>
              )}
              {depositStatus === "submitted" && <div className="adm-od-review"><DepositReview id={data.id} /></div>}

              <div className="adm-od-collect">
                <span>المطلوب تحصيله عند الاستلام</span>
                <strong>{formatPrice(toCollect)}</strong>
                <small>{depositStatus && depositStatus !== "confirmed" ? `${formatPrice(roundMoney(total - deposit))} بعد تأكيد العربون` : pay}</small>
              </div>
            </section>
          </aside>
        </div>
      </div>
      <OrderInvoice order={data} items={items} />
    </>
  );
}
