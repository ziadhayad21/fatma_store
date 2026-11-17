import Image from "next/image";
import { formatDate } from "@/lib/admin/format";
import { formatPrice } from "@/lib/format";
import { fontLabel } from "@/lib/name-fonts";
import { roundMoney } from "@/lib/pricing/discount";
import type { FontId, OrderMode, ProductImage } from "@/lib/types";

export type InvoiceItem = {
  id: string;
  name_snapshot: string;
  product_image_snapshot?: ProductImage | null;
  mode: OrderMode;
  text: string | null;
  font: FontId | null;
  qty: number;
  unit_price: number | string;
  original_unit_price?: number | string | null;
  discount_percent?: number | string | null;
};

type InvoiceOrder = {
  number: number | string;
  created_at: string;
  customer_name: string;
  phone: string;
  governorate: string;
  area: string;
  address: string;
  notes: string | null;
  subtotal: number | string;
  shipping: number | string;
  total: number | string;
};

export function OrderInvoice({ order, items, status, payment }: {
  order: InvoiceOrder;
  items: InvoiceItem[];
  status: string;
  payment: string;
}) {
  const subtotal = Number(order.subtotal);
  const discount = roundMoney(items.reduce((sum, item) => (
    item.original_unit_price == null ? sum : sum + (Number(item.original_unit_price) - Number(item.unit_price)) * item.qty
  ), 0));

  return (
    <article className="adm-invoice" aria-labelledby="invoice-title" lang="ar" dir="rtl">
      <header className="invoice-header">
        <div className="invoice-brand">
          <Image src="/brand/logo-full.png" alt="" width={120} height={60} loading="eager" />
          <strong>فاطمة</strong>
        </div>
        <div>
          <h1 id="invoice-title">فاتورة طلب</h1>
          <bdi dir="ltr">#{order.number}</bdi>
        </div>
      </header>

      <div className="invoice-info">
        <section>
          <h2>بيانات الطلب</h2>
          <dl>
            <dt>التاريخ والوقت</dt><dd><time dateTime={order.created_at}>{formatDate(order.created_at)}</time></dd>
            <dt>حالة الطلب</dt><dd>{status}</dd>
            <dt>طريقة الدفع</dt><dd>{payment}</dd>
          </dl>
        </section>
        <section>
          <h2>بيانات العميل والتوصيل</h2>
          <dl>
            <dt>الاسم</dt><dd>{order.customer_name}</dd>
            <dt>الهاتف</dt><dd><bdi dir="ltr">{order.phone}</bdi></dd>
            <dt>المحافظة</dt><dd>{order.governorate}</dd>
            <dt>المنطقة</dt><dd>{order.area}</dd>
            <dt>العنوان</dt><dd className="invoice-address" dir="auto">{order.address}</dd>
            {order.notes && <><dt>ملاحظات</dt><dd className="invoice-address" dir="auto">{order.notes}</dd></>}
          </dl>
        </section>
      </div>

      <table className="invoice-items">
        <caption>المنتجات</caption>
        <colgroup>
          <col className="invoice-product-col" />
          <col className="invoice-qty-col" />
          <col /><col className="invoice-qty-col" /><col /><col />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">المنتج</th>
            <th scope="col">الكمية</th>
            <th scope="col">السعر الأصلي للوحدة</th>
            <th scope="col">الخصم</th>
            <th scope="col">سعر الوحدة النهائي</th>
            <th scope="col">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const photo = item.product_image_snapshot;
            const unit = Number(item.unit_price);
            return (
              <tr key={item.id}>
                <td>
                  <div className="invoice-product">
                    {photo?.src && <Image src={photo.src} alt="" width={34} height={42} loading="eager" style={{ objectPosition: photo.position }} />}
                    <div>
                      <strong dir="auto">{item.name_snapshot}</strong>
                      <div className="invoice-option">
                        {item.mode === "name" ? <>باسم «<bdi>{item.text}</bdi>» · خط {fontLabel(item.font)}</>
                          : item.mode === "design" ? "بتصميم العميل" : "بدون تخصيص"}
                      </div>
                    </div>
                  </div>
                </td>
                <td>{item.qty}</td>
                <td><bdi>{formatPrice(Number(item.original_unit_price ?? item.unit_price))}</bdi></td>
                <td>{item.discount_percent == null ? "—" : <bdi dir="ltr">-{Number(item.discount_percent)}%</bdi>}</td>
                <td><bdi>{formatPrice(unit)}</bdi></td>
                <td><bdi>{formatPrice(roundMoney(unit * item.qty))}</bdi></td>
              </tr>
            );
          })}
          {items.length === 0 && <tr><td colSpan={6}>لا توجد منتجات مسجلة.</td></tr>}
        </tbody>
      </table>

      <section className="invoice-totals" aria-label="ملخص الفاتورة">
        <h2>ملخص الفاتورة</h2>
        <dl>
          <dt>المجموع الفرعي قبل الخصم</dt><dd>{formatPrice(roundMoney(subtotal + discount))}</dd>
          <dt>إجمالي الخصم</dt><dd>{formatPrice(discount)}</dd>
          <dt>المجموع الفرعي بعد الخصم</dt><dd>{formatPrice(subtotal)}</dd>
          <dt>الشحن</dt><dd>{formatPrice(Number(order.shipping))}</dd>
          <dt className="invoice-total">الإجمالي النهائي</dt><dd className="invoice-total">{formatPrice(Number(order.total))}</dd>
        </dl>
      </section>
    </article>
  );
}
