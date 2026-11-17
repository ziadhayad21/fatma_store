import Link from "next/link";
import { StatusForm } from "@/components/admin/StatusForm";
import { requireAdmin } from "@/lib/admin/auth";
import { formatDate, orderDateBoundary } from "@/lib/admin/format";
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
    .select("id, number, customer_name, phone, governorate, address, status, return_reason, total, created_at, order_items(qty)", { count: "exact" })
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
            <tr><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>الموبايل</th><th>المحافظة</th><th scope="col">العنوان الكامل</th><th>القطع</th><th>الإجمالي</th><th>الحالة</th><th scope="col">سبب الإرجاع</th></tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => (
              <tr key={o.id}>
                <td><Link href={`/admin/orders/${o.id}`}><b><bdi dir="ltr">#{o.number}</bdi></b></Link></td>
                <td className="adm-date-cell"><time dateTime={o.created_at}>{formatDate(o.created_at)}</time></td>
                <td className="adm-customer-cell">{o.customer_name}</td>
                <td dir="ltr" style={{ textAlign: "right" }}>{o.phone}</td>
                <td>{o.governorate}</td>
                <td><p className="adm-order-address" dir="auto">{o.address}</p></td>
                <td>{(o.order_items as { qty: number }[]).reduce((a, i) => a + i.qty, 0)}</td>
                <td className="adm-total-cell">{formatPrice(Number(o.total))}</td>
                <td>
                  <div className="adm-order-status">
                    <span className="adm-badge" data-s={o.status}>{isOrderStatus(o.status) ? STATUS_AR[o.status] : o.status}</span>
                    <StatusForm id={o.id} status={o.status} compact />
                  </div>
                </td>
                <td>
                  {o.status === "returned" && o.return_reason
                    ? <p className="adm-order-return-reason" dir="auto">{o.return_reason}</p>
                    : <span aria-label="لا يوجد سبب إرجاع">—</span>}
                </td>
              </tr>
            ))}
            {(orders ?? []).length === 0 && <tr><td colSpan={10} className="adm-sub">مفيش طلبات مطابقة.</td></tr>}
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
