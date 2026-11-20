import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryForm, type CategoryFormValues } from "@/components/admin/CategoryForm";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata = { title: "تعديل قسم" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function CategoryEdit({ params, searchParams }: PageProps<"/admin/categories/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "new";
  if (!isNew && !UUID.test(id)) notFound();
  const { supabase } = await requireAdmin();

  let values: CategoryFormValues = {
    id: "new",
    name_ar: "",
    slug: "",
    description_ar: "",
    promo_title_ar: "",
    sort: "0",
    is_active: true,
    has_colors: false,
    allows_couples: false,
    image: [],
  };
  if (!isNew) {
    const { data: c } = await supabase.from("categories").select("*").eq("id", id).maybeSingle();
    if (!c) notFound();
    values = {
      id: c.id,
      name_ar: c.name_ar,
      slug: c.slug,
      description_ar: c.description_ar,
      promo_title_ar: c.promo_title_ar,
      sort: String(c.sort),
      is_active: c.is_active,
      has_colors: !!c.has_colors,
      allows_couples: !!c.allows_couples,
      image: c.image ? [{ src: c.image, alt: c.image_alt, position: c.image_position }] : [],
    };
  }
  return (
    <>
      <div className="adm-head">
        <div>
          <p className="adm-sub"><Link href="/admin/categories">← الأقسام</Link></p>
          <h1>{isNew ? "قسم جديد" : values.name_ar}</h1>
          {sp.created && <p className="adm-ok" role="status">اتضاف القسم.</p>}
        </div>
        {!isNew && <a className="adm-btn ghost" href={`/collections/${values.slug}`} target="_blank" rel="noreferrer">فتح في الموقع ↗</a>}
      </div>
      <CategoryForm values={values} />
    </>
  );
}
