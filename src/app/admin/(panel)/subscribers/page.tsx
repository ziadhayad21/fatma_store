import { requireAdmin } from "@/lib/admin/auth";
import { formatDate } from "@/lib/admin/format";

export const metadata = { title: "المشتركين" };

export default async function SubscribersPage() {
  const { supabase } = await requireAdmin();
  const [{ data, count }] = await Promise.all([
    supabase.from("newsletter_subscribers").select("id, email, created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(300),
  ]);
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>المشتركين في النشرة</h1>
          <p className="adm-sub">{count ?? 0} مشترك</p>
        </div>
        <a className="adm-btn ghost" href="/admin/subscribers/export" download>تحميل CSV</a>
      </div>
      <div className="adm-table-wrap">
        <table>
          <thead><tr><th>الإيميل</th><th>تاريخ الاشتراك</th></tr></thead>
          <tbody>
            {(data ?? []).map((s) => (
              <tr key={s.id}><td dir="ltr" style={{ textAlign: "right" }}>{s.email}</td><td>{formatDate(s.created_at)}</td></tr>
            ))}
            {(data ?? []).length === 0 && <tr><td colSpan={2} className="adm-sub">لسه مفيش مشتركين.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
