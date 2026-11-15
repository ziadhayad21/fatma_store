import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { formatDate } from "@/lib/admin/format";
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
  const status = isOrderStatus(one(sp.status)) ? one(sp.status) : "";
  const q = one(sp.q).slice(0, 80);
  const page = Math.max(1, Math.min(Number(one(sp.page)) || 1, 1000));
  const filter = orderSearchFilter(q);

  let query = supabase
    .from("orders")
    .select("id, number, customer_name, phone, governorate, status, total, created_at, order_items(qty)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (status) query = query.eq("status", status);
  if (filter) query = query.or(filter);

  const [{ data: orders, count, error }, ...counts] = await Promise.all([
    query,
    ...ORDER_STATUSES.map((s) => supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", s)),
  ]);
  const total = counts.reduce((a, c) => a + (c.count ?? 0), 0);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));

  const href = (over: Partial<{ status: string; q: string; page: number }>) => {
    const p = new URLSearchParams();
    const s = over.status ?? status;
    const qq = over.q ?? q;
    if (s) p.set("status", s);
    if (qq) p.set("q", qq);
    if ((over.page ?? 1) > 1) p.set("page", String(over.page));
    const str = p.toString();
    return `/admin/orders${str ? `?${str}` : ""}`;
  };

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>الطلبات</h1>
          <p className="adm-sub">{count ?? 0} طلب{status || q ? " (بعد الفلترة)" : ""}</p>
        </div>
      </div>

      <div className="adm-tabs" role="navigation" aria-label="فلتر الحالة">
        <Link className={`adm-tab${!status ? " on" : ""}`} href={href({ status: "", page: 1 })}>الكل<small>{total}</small></Link>
        {ORDER_STATUSES.map((s, i) => (
          <Link key={s} className={`adm-tab${status === s ? " on" : ""}`} href={href({ status: s, page: 1 })}>
            {STATUS_AR[s]}<small>{counts[i].count ?? 0}</small>
          </Link>
        ))}
      </div>

      <form className="adm-search" action="/admin/orders" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        <input type="search" name="q" defaultValue={q} placeholder="ابحث برقم الطلب أو الموبايل أو الاسم" aria-label="بحث" style={{ width: 340, maxWidth: "100%" }} />
        <button className="adm-btn" type="submit">بحث</button>
        {q && <Link className="adm-btn ghost" href={href({ q: "", page: 1 })}>مسح البحث</Link>}
      </form>

      {error && <div className="adm-alert" role="alert">حصلت مشكلة في تحميل الطلبات.</div>}

      <div className="adm-table-wrap">
        <table>
          <thead>
            <tr><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>الموبايل</th><th>المحافظة</th><th>القطع</th><th>الإجمالي</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => (
              <tr key={o.id}>
                <td><Link href={`/admin/orders/${o.id}`}><b><bdi dir="ltr">#{o.number}</bdi></b></Link></td>
                <td>{formatDate(o.created_at)}</td>
                <td>{o.customer_name}</td>
                <td dir="ltr" style={{ textAlign: "right" }}>{o.phone}</td>
                <td>{o.governorate}</td>
                <td>{(o.order_items as { qty: number }[]).reduce((a, i) => a + i.qty, 0)}</td>
                <td>{formatPrice(Number(o.total))}</td>
                <td><span className="adm-badge" data-s={o.status}>{STATUS_AR[o.status as keyof typeof STATUS_AR]}</span></td>
              </tr>
            ))}
            {(orders ?? []).length === 0 && <tr><td colSpan={8} className="adm-sub">مفيش طلبات مطابقة.</td></tr>}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="adm-pager" aria-label="الصفحات">
          {page > 1 && <Link className="adm-btn ghost sm" href={href({ page: page - 1 })}>السابق</Link>}
          <span>صفحة {page} من {pages}</span>
          {page < pages && <Link className="adm-btn ghost sm" href={href({ page: page + 1 })}>التالي</Link>}
        </nav>
      )}
    </>
  );
}
