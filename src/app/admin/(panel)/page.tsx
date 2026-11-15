import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { formatDate } from "@/lib/admin/format";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUSES, STATUS_AR } from "@/lib/order-status";

export const metadata = { title: "الرئيسية" };

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const counts = await Promise.all(
    ORDER_STATUSES.map(async (s) => {
      const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", s);
      return [s, count ?? 0] as const;
    }),
  );
  const [{ data: recent }, { count: unsetFees }, { count: products }] = await Promise.all([
    supabase.from("orders").select("id, number, customer_name, status, total, created_at").order("created_at", { ascending: false }).limit(8),
    supabase.from("shipping_rates").select("governorate", { count: "exact", head: true }).is("fee", null),
    supabase.from("products").select("id", { count: "exact", head: true }),
  ]);

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>الرئيسية</h1>
          <p className="adm-sub">ملخص سريع للطلبات والإعدادات.</p>
        </div>
      </div>

      {(unsetFees ?? 0) > 0 && (
        <div className="adm-alert" role="status">
          سعر الشحن لسه مش متحدد لـ {unsetFees} محافظة — العملاء مش هيقدروا يطلبوا منها. <Link href="/admin/shipping">حدّد أسعار الشحن</Link>
        </div>
      )}

      <div className="adm-stats">
        {counts.map(([s, n]) => (
          <Link key={s} className="adm-stat" href={`/admin/orders?status=${s}`}>
            <b>{n}</b>
            <span>{STATUS_AR[s]}</span>
          </Link>
        ))}
        <Link className="adm-stat" href="/admin/products">
          <b>{products ?? 0}</b>
          <span>منتجات</span>
        </Link>
      </div>

      <h2>آخر الطلبات</h2>
      <div className="adm-table-wrap">
        <table>
          <thead>
            <tr><th>الرقم</th><th>العميل</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            {(recent ?? []).map((o) => (
              <tr key={o.id}>
                <td><Link href={`/admin/orders/${o.id}`}><bdi dir="ltr">#{o.number}</bdi></Link></td>
                <td>{o.customer_name}</td>
                <td>{formatDate(o.created_at)}</td>
                <td>{formatPrice(Number(o.total))}</td>
                <td><span className="adm-badge" data-s={o.status}>{STATUS_AR[o.status as keyof typeof STATUS_AR]}</span></td>
              </tr>
            ))}
            {(recent ?? []).length === 0 && <tr><td colSpan={5} className="adm-sub">مفيش طلبات لسه.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
