"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { deleteOrders } from "@/app/actions/admin-storage";
import { Icon } from "@/components/ui/Icon";
import { formatDay } from "@/lib/admin/format";
import { formatPrice } from "@/lib/format";
import { isOrderStatus, STATUS_AR } from "@/lib/order-status";
import { DEPOSIT_LABEL, type DepositStatus } from "@/lib/product-rules";

export type OrderRow = {
  id: string;
  number: number;
  customer_name: string;
  governorate: string;
  status: string;
  deposit_status: string | null;
  total: number | string;
  created_at: string;
};

/** The orders table, with row checkboxes and "حذف المحدد" (confirm dialog with the count). */
export function OrdersTable({ rows }: { rows: OrderRow[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  // only rows still on this page count (after a filter / page change)
  const selected = rows.filter((r) => picked.has(r.id));
  const all = rows.length > 0 && selected.length === rows.length;

  const toggle = (id: string, on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  function confirm() {
    if (pending || selected.length === 0) return;
    setError("");
    start(async () => {
      const res = await deleteOrders(selected.map((r) => r.id)).catch(() => null);
      if (!res?.ok) {
        setError(res?.message ?? "تعذّر حذف الطلبات. جرّب تاني.");
        return;
      }
      dialog.current?.close();
      setPicked(new Set());
      setNotice(res.deleted === 1 ? "اتحذف طلب واحد." : `اتحذف ${res.deleted} طلب.`);
      router.refresh();
    });
  }

  return (
    <>
      {notice && <p className="adm-ok" role="status">{notice}</p>}
      {selected.length > 0 && (
        <div className="adm-bulk" role="region" aria-label="إجراءات على الطلبات المحددة">
          <span>
            <b>{selected.length}</b> {selected.length === 1 ? "طلب محدد" : "طلبات محددة"}
          </span>
          <button type="button" className="adm-link" onClick={() => setPicked(new Set())}>إلغاء التحديد</button>
          <button
            type="button"
            className="adm-btn sm adm-delete-btn"
            onClick={() => {
              setError("");
              dialog.current?.showModal();
            }}
          >
            <Icon name="trash" size={14} /> حذف المحدد
          </button>
        </div>
      )}

      <div className="adm-table-wrap adm-orders-table" role="region" aria-label="جدول الطلبات" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col" className="adm-check-cell">
                <input
                  type="checkbox"
                  aria-label="تحديد كل الطلبات في الصفحة"
                  checked={all}
                  ref={(el) => {
                    if (el) el.indeterminate = selected.length > 0 && !all;
                  }}
                  onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </th>
              <th scope="col">الرقم</th>
              <th scope="col">التاريخ</th>
              <th scope="col">العميل</th>
              <th scope="col">المحافظة</th>
              <th scope="col" className="num">الإجمالي</th>
              <th scope="col">الحالة</th>
              <th scope="col">العربون</th>
              <th scope="col"><span className="vh">الإجراءات</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} data-picked={picked.has(o.id) || undefined}>
                <td className="adm-check-cell">
                  <input type="checkbox" aria-label={`تحديد الطلب ${o.number}`} checked={picked.has(o.id)} onChange={(e) => toggle(o.id, e.target.checked)} />
                </td>
                <td>
                  <Link href={`/admin/orders/${o.id}`} className="adm-order-num-link">
                    <bdi dir="ltr">#{o.number}</bdi>
                  </Link>
                </td>
                <td className="adm-date-cell">
                  <time dateTime={o.created_at}>{formatDay(o.created_at)}</time>
                </td>
                <td className="adm-customer-cell">
                  <span className="adm-customer-name" dir="auto">{o.customer_name}</span>
                </td>
                <td>{o.governorate}</td>
                <td className="adm-total-cell num">{formatPrice(Number(o.total))}</td>
                <td>
                  <span className="adm-pill" data-s={o.status}>{isOrderStatus(o.status) ? STATUS_AR[o.status] : o.status}</span>
                </td>
                <td>
                  {o.deposit_status ? (
                    <span className="adm-pill" data-d={o.deposit_status}>{DEPOSIT_LABEL[o.deposit_status as DepositStatus]}</span>
                  ) : (
                    <span className="adm-empty-dash" aria-label="بدون عربون">—</span>
                  )}
                </td>
                <td className="adm-actions-cell">
                  <Link href={`/admin/orders/${o.id}`} className="adm-view-order-btn">
                    عرض التفاصيل
                    <span className="vh"> للطلب {o.number}</span>
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="adm-sub" style={{ textAlign: "center", padding: "32px 16px" }}>
                  مفيش طلبات مطابقة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <dialog ref={dialog} className="adm-delete-dialog" aria-labelledby={`${uid}-t`} aria-describedby={`${uid}-d`} onCancel={(e) => pending && e.preventDefault()}>
        <form
          className="adm-form"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <h2 id={`${uid}-t`}>حذف {selected.length === 1 ? "طلب واحد" : `${selected.length} طلبات`}</h2>
          <p id={`${uid}-d`}>
            هيتمسح {selected.length === 1 ? "الطلب" : `${selected.length} طلب`} نهائيًا مع منتجاتهم وملفاتهم (التصاميم وإثباتات التحويل):{" "}
            <bdi dir="ltr">{selected.slice(0, 8).map((r) => `#${r.number}`).join("، ")}{selected.length > 8 ? "…" : ""}</bdi>
          </p>
          {error && <p className="adm-err" role="alert">{error}</p>}
          <div className="adm-return-actions">
            <button type="button" className="adm-btn ghost" disabled={pending} onClick={() => dialog.current?.close()}>إلغاء</button>
            <button type="submit" className="adm-btn adm-delete-btn" disabled={pending}>
              {pending ? "جاري الحذف…" : `احذف ${selected.length === 1 ? "الطلب" : `${selected.length} طلب`}`}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
