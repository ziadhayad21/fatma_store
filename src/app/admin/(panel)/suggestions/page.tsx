import Link from "next/link";
import { DeleteSuggestion } from "@/components/admin/DeleteSuggestion";
import { requireAdmin } from "@/lib/admin/auth";
import { formatDay } from "@/lib/admin/format";

export const metadata = { title: "الاقتراحات" };
const LIMIT = 300;

type OrderRef = { id: string; number: number };
type Row = { id: string; text: string; created_at: string; order: OrderRef | OrderRef[] | null };

/** Every suggestion is shown on the site as soon as it is sent; the admin can only delete. */
export default async function SuggestionsPage() {
  const { supabase } = await requireAdmin();
  const [{ data, error }, { count: total }] = await Promise.all([
    supabase
      .from("suggestions")
      .select("id, text, created_at, order:orders(id, number)")
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase.from("suggestions").select("id", { count: "exact", head: true }),
  ]);
  const rows = (data ?? []) as Row[];

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>الاقتراحات</h1>
          <p className="adm-sub">{total ?? 0} اقتراح · كل اقتراح بيظهر في الموقع على طول</p>
        </div>
        <div className="adm-head-actions">
          <a className="adm-btn ghost" href="/admin/suggestions/export" download>تحميل CSV</a>
        </div>
      </div>

      {error && <div className="adm-alert" role="alert">حصلت مشكلة في تحميل الاقتراحات.</div>}

      {rows.length > 0 && (
        <ul className="adm-suggestions">
          {rows.map((s) => {
            const order = Array.isArray(s.order) ? s.order[0] : s.order;
            return (
              <li key={s.id} className="adm-suggestion">
                <p className="adm-suggestion-text" dir="auto">{s.text}</p>
                <div className="adm-suggestion-meta">
                  <time dateTime={s.created_at}>{formatDay(s.created_at)}</time>
                  {order && (
                    <Link href={`/admin/orders/${order.id}`} className="adm-suggestion-order">
                      طلب <bdi dir="ltr">#{order.number}</bdi>
                    </Link>
                  )}
                  <span className="adm-suggestion-action">
                    <DeleteSuggestion id={s.id} preview={s.text} />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length === 0 && !error && <p className="adm-empty-state">لسه مفيش اقتراحات.</p>}
    </>
  );
}
