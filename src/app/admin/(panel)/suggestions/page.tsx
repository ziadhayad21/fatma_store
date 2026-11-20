import Link from "next/link";
import { markAllSuggestionsRead, markSuggestionRead } from "@/app/actions/admin-suggestions";
import { SuggestionModeration } from "@/components/admin/SuggestionModeration";
import { requireAdmin } from "@/lib/admin/auth";
import { formatDay } from "@/lib/admin/format";
import { isSuggestionStatus, SUGGESTION_STATUS_LABEL } from "@/lib/suggestions";
import type { SuggestionStatus } from "@/lib/types";

export const metadata = { title: "الاقتراحات" };
const LIMIT = 300;

type OrderRef = { id: string; number: number };
type Row = {
  id: string;
  text: string;
  created_at: string;
  is_read: boolean;
  is_public: boolean;
  status: string;
  admin_reply: string | null;
  order: OrderRef | OrderRef[] | null;
};

export default async function SuggestionsPage({ searchParams }: PageProps<"/admin/suggestions">) {
  const sp = await searchParams;
  const unreadOnly = sp.filter === "unread";
  const publicOnly = sp.filter === "public";
  const { supabase } = await requireAdmin();

  let list = supabase
    .from("suggestions")
    .select("id, text, created_at, is_read, is_public, status, admin_reply, order:orders(id, number)")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (unreadOnly) list = list.eq("is_read", false);
  if (publicOnly) list = list.eq("is_public", true);
  const [{ data, error }, { count: total }, { count: unread }, { count: shown }] = await Promise.all([
    list,
    supabase.from("suggestions").select("id", { count: "exact", head: true }),
    supabase.from("suggestions").select("id", { count: "exact", head: true }).eq("is_read", false),
    supabase.from("suggestions").select("id", { count: "exact", head: true }).eq("is_public", true),
  ]);
  const all = !unreadOnly && !publicOnly;
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
        <Link href="/admin/suggestions" className={`adm-tab${all ? " on" : ""}`} aria-current={all ? "page" : undefined}>
          الكل<small>{total ?? 0}</small>
        </Link>
        <Link href="/admin/suggestions?filter=unread" className={`adm-tab${unreadOnly ? " on" : ""}`} aria-current={unreadOnly ? "page" : undefined}>
          غير مقروء<small>{unread ?? 0}</small>
        </Link>
        <Link href="/admin/suggestions?filter=public" className={`adm-tab${publicOnly ? " on" : ""}`} aria-current={publicOnly ? "page" : undefined}>
          معروض في الموقع<small>{shown ?? 0}</small>
        </Link>
      </nav>

      {error && <div className="adm-alert" role="alert">حصلت مشكلة في تحميل الاقتراحات.</div>}

      {rows.length > 0 && (
        <ul className="adm-suggestions">
          {rows.map((s) => {
            const order = Array.isArray(s.order) ? s.order[0] : s.order;
            const status: SuggestionStatus = isSuggestionStatus(s.status) ? s.status : "new";
            return (
              <li key={s.id} className="adm-suggestion" data-unread={!s.is_read || undefined} data-public={s.is_public || undefined}>
                <p className="adm-suggestion-text" dir="auto">{s.text}</p>
                <div className="adm-suggestion-meta">
                  {!s.is_read && <span className="adm-pill" data-s="new">غير مقروء</span>}
                  {status !== "new" && <span className="adm-pill" data-s={status}>{SUGGESTION_STATUS_LABEL[status]}</span>}
                  {s.is_public && <span className="adm-pill" data-s="public">معروض في الموقع</span>}
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
                <SuggestionModeration id={s.id} isPublic={s.is_public} status={status} reply={s.admin_reply} />
              </li>
            );
          })}
        </ul>
      )}
      {rows.length === 0 && !error && (
        <p className="adm-empty-state">{unreadOnly ? "مفيش اقتراحات جديدة." : publicOnly ? "مفيش اقتراحات معروضة في الموقع." : "لسه مفيش اقتراحات."}</p>
      )}
    </>
  );
}
