import Link from "next/link";
import { moveReview, setReviewPublished } from "@/app/actions/admin-reviews";
import { DeleteSamplesButton } from "@/components/admin/DeleteSamplesButton";
import { requireAdmin } from "@/lib/admin/auth";
import { MIN_REVIEWS } from "@/lib/reviews";

export const metadata = { title: "الآراء" };

export default async function ReviewsAdmin() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("reviews")
    .select("id, customer_name, text, is_published, is_sample, sort, product:products(name_ar)")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  const published = rows.filter((r) => r.is_published).length;
  const samples = rows.filter((r) => r.is_sample).length;
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>الآراء</h1>
          <p className="adm-sub">
            {published} ظاهر من {rows.length}. قسم الآراء في الرئيسية بيظهر لما يبقى {MIN_REVIEWS} آراء ظاهرة على الأقل{published < MIN_REVIEWS ? " — دلوقتي هو مخفي." : "."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {samples > 0 && <DeleteSamplesButton count={samples} />}
          <Link className="adm-btn" href="/admin/reviews/new">+ رأي جديد</Link>
        </div>
      </div>
      <div className="adm-table-wrap">
        <table>
          <thead><tr><th>العميل</th><th>الرأي</th><th>اشترت</th><th>الحالة</th><th>الترتيب</th><th></th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const p = r.product as unknown as { name_ar: string } | null;
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/reviews/${r.id}`}><b>{r.customer_name}</b></Link>
                    {r.is_sample && <span className="adm-badge" data-s="new" style={{ marginInlineStart: 8 }}>عيّنة</span>}
                  </td>
                  <td style={{ maxWidth: 360 }}>{String(r.text).slice(0, 90)}{String(r.text).length > 90 ? "…" : ""}</td>
                  <td>{p?.name_ar ?? "—"}</td>
                  <td>{r.is_published ? "ظاهر" : <span className="adm-badge" data-s="cancelled">مخفي</span>}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <form action={moveReview}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="dir" value="up" />
                        <button className="adm-btn ghost sm" type="submit" disabled={i === 0} aria-label={`حرّك رأي ${r.customer_name} لفوق`}>↑</button>
                      </form>
                      <form action={moveReview}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="dir" value="down" />
                        <button className="adm-btn ghost sm" type="submit" disabled={i === rows.length - 1} aria-label={`حرّك رأي ${r.customer_name} لتحت`}>↓</button>
                      </form>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <form action={setReviewPublished}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="publish" value={r.is_published ? "0" : "1"} />
                        <button className="adm-btn ghost sm" type="submit">{r.is_published ? "إخفاء" : "إظهار"}</button>
                      </form>
                      <Link className="adm-btn ghost sm" href={`/admin/reviews/${r.id}`}>تعديل</Link>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="adm-sub">لسه مفيش آراء. أضف رأي حقيقي من عميل فعلاً.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
