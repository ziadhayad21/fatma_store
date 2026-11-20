import Image from "next/image";
import { formatDay } from "@/lib/admin/format";
import { formatPrice } from "@/lib/format";
import { itemOptionLine, itemPieceLines } from "@/lib/admin/order-item";
import type { StoredPiece } from "@/lib/couples";
import { roundMoney } from "@/lib/pricing/discount";
import { getItemCustomizationNote, type DepositStatus, type ProductColor } from "@/lib/product-rules";
import type { FontId, OrderMode, ProductImage } from "@/lib/types";

export type InvoiceItem = {
  id: string;
  name_snapshot: string;
  product_image_snapshot?: ProductImage | null;
  mode: OrderMode;
  text: string | null;
  font: FontId | null;
  color?: ProductColor | null;
  color_name?: string | null;
  qty: number;
  unit_price: number | string;
  original_unit_price?: number | string | null;
  discount_percent?: number | string | null;
  /** couples products: one snapshot per piece */
  pieces?: StoredPiece[] | null;
};

type InvoiceOrder = {
  number: number | string;
  created_at: string;
  customer_name: string;
  phone: string;
  governorate: string;
  area: string;
  address: string;
  customization_notes?: string | null;
  deposit_amount?: number | string;
  deposit_status?: DepositStatus | null;
  subtotal: number | string;
  shipping: number | string;
  total: number | string;
};

/** One short line under the product name: option · colour · font · customization note. */
function itemDetails(item: InvoiceItem, note: string | null): string {
  return note ? `${itemOptionLine(item)} · ${note.replace(/\s+/g, " ")}` : itemOptionLine(item);
}

/**
 * Print-only invoice (A4, black & white, Arabic only). Prices are the ones stored on the order:
 * each line shows its price before discount, so the lines add up to «المجموع».
 */
export function OrderInvoice({ order, items }: { order: InvoiceOrder; items: InvoiceItem[] }) {
  const listUnit = (item: InvoiceItem) => Number(item.original_unit_price ?? item.unit_price);
  const gross = roundMoney(items.reduce((sum, item) => sum + listUnit(item) * item.qty, 0));
  const subtotal = Number(order.subtotal);
  // the stored subtotal is after discount; anything above it on the lines is the discount
  const discount = Math.max(0, roundMoney(gross - subtotal));
  const hasDeposit = !!order.deposit_status;
  const depositPaid = order.deposit_status === "confirmed" ? Number(order.deposit_amount ?? 0) : 0;
  const toCollect = roundMoney(Number(order.total) - depositPaid);

  return (
    <article className="adm-invoice" aria-labelledby="invoice-title" lang="ar" dir="rtl">
      <header className="invoice-header">
        <div className="invoice-brand">
          <Image src="/brand/logo-full.png" alt="" width={120} height={60} loading="eager" />
          <strong>فاطمة</strong>
        </div>
        <div className="invoice-meta">
          <h1 id="invoice-title">فاتورة</h1>
          <div>رقم الطلب <bdi dir="ltr">#{order.number}</bdi></div>
          <div><time dateTime={order.created_at}>{formatDay(order.created_at)}</time></div>
        </div>
      </header>

      <section className="invoice-customer" aria-label="بيانات العميل">
        <dl>
          <dt>الاسم</dt><dd>{order.customer_name}</dd>
          <dt>الموبايل</dt><dd><bdi dir="ltr">{order.phone}</bdi></dd>
          <dt>المحافظة</dt><dd>{order.governorate}</dd>
          <dt>العنوان</dt><dd className="invoice-address" dir="auto">{[order.area, order.address].filter(Boolean).join("، ")}</dd>
        </dl>
      </section>

      <table className="invoice-items">
        <colgroup>
          <col />
          <col className="invoice-num-col" />
          <col className="invoice-money-col" />
          <col className="invoice-money-col" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">المنتج</th>
            <th scope="col">الكمية</th>
            <th scope="col">السعر</th>
            <th scope="col">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const unit = listUnit(item);
            const note = getItemCustomizationNote(order.customization_notes, item, items);
            return (
              <tr key={item.id}>
                <td>
                  <strong dir="auto">{item.name_snapshot}</strong>
                  <div className="invoice-option" dir="auto">{itemDetails(item, note)}</div>
                  {itemPieceLines(item).map((line, k) => (
                    <div className="invoice-option invoice-piece" dir="auto" key={k}>{line}</div>
                  ))}
                </td>
                <td>{item.qty}</td>
                <td>{formatPrice(unit)}</td>
                <td>{formatPrice(roundMoney(unit * item.qty))}</td>
              </tr>
            );
          })}
          {items.length === 0 && <tr><td colSpan={4}>لا توجد منتجات مسجلة.</td></tr>}
        </tbody>
      </table>

      <section className="invoice-totals" aria-label="ملخص الفاتورة">
        <dl>
          <dt>المجموع</dt><dd>{formatPrice(gross)}</dd>
          {discount > 0 && <><dt>الخصم</dt><dd>- {formatPrice(discount)}</dd></>}
          <dt>الشحن</dt><dd>{formatPrice(Number(order.shipping))}</dd>
          <dt className="invoice-total">الإجمالي</dt><dd className="invoice-total">{formatPrice(Number(order.total))}</dd>
          {hasDeposit && <>
            <dt>العربون المدفوع</dt><dd>- {formatPrice(depositPaid)}</dd>
            <dt className="invoice-collect">المطلوب تحصيله عند الاستلام</dt><dd className="invoice-collect">{formatPrice(toCollect)}</dd>
          </>}
        </dl>
      </section>
    </article>
  );
}
