import Image from "next/image";
import Link from "next/link";
import { CatalogDeletionArea, DeleteCatalogItem } from "@/components/admin/DeleteCatalogItem";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata = { title: "الأقسام" };

export default async function CategoriesAdmin() {
  const { supabase } = await requireAdmin();
  const [{ data }, { data: counts }] = await Promise.all([
    supabase.from("categories").select("*").order("sort"),
    supabase.from("products").select("category_id"),
  ]);
  const n = new Map<string, number>();
  for (const p of counts ?? []) n.set(p.category_id, (n.get(p.category_id) ?? 0) + 1);
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>الأقسام</h1>
          <p className="adm-sub">الأقسام بتظهر تلقائيًا في القائمة والفوتر وصفحة الأقسام والرئيسية.</p>
        </div>
        <Link className="adm-btn" href="/admin/categories/new">+ قسم جديد</Link>
      </div>
      <CatalogDeletionArea>
        <div className="adm-table-wrap">
          <table>
            <thead><tr><th></th><th>القسم</th><th>المنتجات</th><th>الترتيب</th><th>الحالة</th><th></th></tr></thead>
            <tbody>
              {(data ?? []).map((c) => (
                <tr key={c.id}>
                  <td style={{ width: 56 }}>
                    {c.image ? <Image src={c.image} alt="" width={40} height={52} style={{ objectFit: "cover", objectPosition: c.image_position }} /> : null}
                  </td>
                  <td><Link href={`/admin/categories/${c.id}`}><b>{c.name_ar}</b></Link><div className="adm-hint" dir="ltr" style={{ textAlign: "right" }}>/collections/{c.slug}</div></td>
                  <td>{n.get(c.id) ?? 0}</td>
                  <td>{c.sort}</td>
                  <td>{c.is_active ? "ظاهر" : <span className="adm-badge" data-s="cancelled">مخفي</span>}</td>
                  <td>
                    <div className="adm-catalog-actions">
                      <Link className="adm-btn ghost sm" href={`/admin/categories/${c.id}`}>تعديل</Link>
                      <DeleteCatalogItem id={c.id} name={c.name_ar} kind="category" hasProducts={(n.get(c.id) ?? 0) > 0} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CatalogDeletionArea>
    </>
  );
}
