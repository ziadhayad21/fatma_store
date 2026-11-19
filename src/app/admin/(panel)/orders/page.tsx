import { DEPOSIT_LABEL, type DepositStatus } from "@/lib/product-rules";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { formatDay, orderDateBoundary } from "@/lib/admin/format";
import { orderSearchFilter } from "@/lib/admin/search";
import { formatPrice } from "@/lib/format";
import { isOrderStatus, ORDER_STATUSES, STATUS_AR } from "@/lib/order-status";

export const metadata = { title: "الطلبات" };
const PAGE = 25;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const sp: SP = await searchParams;
  const { supabase } = await requireAdmin();
  const requestedStatus = one(sp.status);
  const status = requestedStatus === "confirmed" || requestedStatus === "printing"
    ? "prepared"
    : isOrderStatus(requestedStatus) ? requestedStatus : "";
  const q = one(sp.q).slice(0, 80);
  const dateFrom = one(sp.from);
  const dateTo = one(sp.to);
  const from = orderDateBoundary(dateFrom);
  const until = orderDateBoundary(dateTo, true);
  const dateError = (dateFrom && !from) || (dateTo && !until)
    ? "اختار تاريخ بداية ونهاية صحيحين."
    : from && until && from >= until ? "تاريخ البداية لازم يكون قبل تاريخ النهاية أو نفس اليوم." : "";
  const hasFilters = Boolean(status || q || dateFrom || dateTo);
  const page = Math.max(1, Math.min(Math.trunc(Number(one(sp.page))) || 1, 1000));
  const filter = orderSearchFilter(q);

  let query = supabase
    .from("orders")
    .select("id, number, customer_name, phone, governorate, status, deposit_status, total, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (status) query = query.eq("status", status);
  if (filter) query = query.or(filter);
  if (!dateError && from) query = query.gte("created_at", from);
  if (!dateError && until) query = query.lt("created_at", until);

  const { data: orders, count, error } = await query;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));

  const href = (nextPage: number) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (q) p.set("q", q);
    if (dateFrom) p.set("from", dateFrom);
    if (dateTo) p.set("to", dateTo);
    if (nextPage > 1) p.set("page", String(nextPage));
    const str = p.toString();
    return `/admin/orders${str ? `?${str}` : ""}`;
  };

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>الطلبات</h1>
          <p className="adm-sub">{count ?? 0} طلب{hasFilters ? " (بعد الفلترة)" : ""}</p>
        </div>
      </div>

      <form key={JSON.stringify([q, status, dateFrom, dateTo])} className="adm-order-filters" action="/admin/orders" role="search" aria-label="فلترة الطلبات">
        <label className="adm-order-filter adm-order-filter-search">
          بحث
          <input type="search" name="q" defaultValue={q} maxLength={80} placeholder="رقم الطلب أو الموبايل أو الاسم" />
        </label>
        <label className="adm-order-filter">
          الحالة
          <select name="status" defaultValue={status}>
            <option value="">كل الحالات</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_AR[s]}</option>)}
          </select>
        </label>
        <label className="adm-order-filter">
          من تاريخ
          <input type="date" name="from" dir="ltr" defaultValue={dateFrom} aria-invalid={Boolean(dateError)} />
        </label>
        <label className="adm-order-filter">
          إلى تاريخ
          <input type="date" name="to" dir="ltr" defaultValue={dateTo} aria-invalid={Boolean(dateError)} />
        </label>
        <div className="adm-order-filter-actions">
          <button className="adm-btn" type="submit">تطبيق</button>
          {hasFilters && <Link className="adm-btn ghost" href="/admin/orders">مسح الفلاتر</Link>}
        </div>
      </form>

      {dateError && <div className="adm-alert" role="alert">{dateError}</div>}
      {error && <div className="adm-alert" role="alert">حصلت مشكلة في تحميل الطلبات.</div>}

      <div className="adm-table-wrap adm-orders-table" role="region" aria-label="جدول الطلبات" tabIndex={0}>
        <table>
          <thead>
            <tr>
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
            {(orders ?? []).map((o) => (
              <tr key={o.id}>
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
                  <a href={`tel:${o.phone}`} className="adm-phone-link" dir="ltr">{o.phone}</a>
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
            {(orders ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="adm-sub" style={{ textAlign: "center", padding: "32px 16px" }}>
                  مفيش طلبات مطابقة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="adm-pager" aria-label="الصفحات">
          {page > 1 && <Link className="adm-btn ghost sm" href={href(page - 1)}>السابق</Link>}
          <span>صفحة {page} من {pages}</span>
          {page < pages && <Link className="adm-btn ghost sm" href={href(page + 1)}>التالي</Link>}
        </nav>
      )}
    </>
  );
}
