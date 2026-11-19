import Link from "next/link";
import { markAllSuggestionsRead, markSuggestionRead } from "@/app/actions/admin-suggestions";
import { requireAdmin } from "@/lib/admin/auth";
import { formatDay } from "@/lib/admin/format";

export const metadata = { title: "الاقتراحات" };
const LIMIT = 300;

type OrderRef = { id: string; number: number };
type Row = { id: string; text: string; created_at: string; is_read: boolean; order: OrderRef | OrderRef[] | null };

export default async function SuggestionsPage({ searchParams }: PageProps<"/admin/suggestions">) {
  const sp = await searchParams;
  const unreadOnly = sp.filter === "unread";
  const { supabase } = await requireAdmin();

  let list = supabase
    .from("suggestions")
    .select("id, text, created_at, is_read, order:orders(id, number)")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (unreadOnly) list = list.eq("is_read", false);
  const [{ data, error }, { count: total }, { count: unread }] = await Promise.all([
    list,
    supabase.from("suggestions").select("id", { count: "exact", head: true }),
    supabase.from("suggestions").select("id", { count: "exact", head: true }).eq("is_read", false),
  ]);
  const rows = (data ?? []) as Row[];

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>الاقتراحات</h1>
          <p className="adm-sub">{total ?? 0} اقتراح{unread ? ` · ${unread} جديد` : ""}</p>
        </div>
        <div className="adm-head-actions">
          {!!unread && (
            <form action={markAllSuggestionsRead}>
              <button className="adm-btn ghost" type="submit">تحديد الكل كمقروء</button>
            </form>
          )}
          <a className="adm-btn ghost" href="/admin/suggestions/export" download>تحميل CSV</a>
        </div>
      </div>

      <nav className="adm-tabs" aria-label="فلترة الاقتراحات">
        <Link href="/admin/suggestions" className={`adm-tab${unreadOnly ? "" : " on"}`} aria-current={unreadOnly ? undefined : "page"}>
          الكل<small>{total ?? 0}</small>
        </Link>
        <Link href="/admin/suggestions?filter=unread" className={`adm-tab${unreadOnly ? " on" : ""}`} aria-current={unreadOnly ? "page" : undefined}>
          غير مقروء<small>{unread ?? 0}</small>
        </Link>
      </nav>

      {error && <div className="adm-alert" role="alert">حصلت مشكلة في تحميل الاقتراحات.</div>}

      {rows.length > 0 && (
        <ul className="adm-suggestions">
          {rows.map((s) => {
            const order = Array.isArray(s.order) ? s.order[0] : s.order;
            return (
              <li key={s.id} className="adm-suggestion" data-unread={!s.is_read || undefined}>
                <p className="adm-suggestion-text" dir="auto">{s.text}</p>
                <div className="adm-suggestion-meta">
                  {!s.is_read && <span className="adm-pill" data-s="new">جديد</span>}
                  <time dateTime={s.created_at}>{formatDay(s.created_at)}</time>
                  {order && (
                    <Link href={`/admin/orders/${order.id}`} className="adm-suggestion-order">
                      طلب <bdi dir="ltr">#{order.number}</bdi>
                    </Link>
                  )}
                  {!s.is_read && (
                    <form action={markSuggestionRead} className="adm-suggestion-action">
                      <input type="hidden" name="id" value={s.id} />
                      <button className="adm-view-order-btn" type="submit">تحديد كمقروء</button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length === 0 && !error && (
        <p className="adm-empty-state">{unreadOnly ? "مفيش اقتراحات جديدة." : "لسه مفيش اقتراحات."}</p>
      )}
    </>
  );
}
