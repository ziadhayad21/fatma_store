import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm, type ProductFormValues } from "@/components/admin/ProductForm";
import { requireAdmin } from "@/lib/admin/auth";
import type { ProductImage } from "@/lib/types";

export const metadata = { title: "تعديل منتج" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ProductEdit({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "new";
  if (!isNew && !UUID.test(id)) notFound();
  const { supabase } = await requireAdmin();

  const { data: cats } = await supabase.from("categories").select("id, name_ar").order("sort");
  let values: ProductFormValues = {
    id: "new",
    name_ar: "",
    slug: "",
    category_id: cats?.[0]?.id ?? "",
    description_ar: "",
    details_ar: "",
    care_ar: "",
    base_price: "",
    discount_percent: "",
    personalization_fee: "0",
    sort: "0",
    is_active: true,
    images: [],
  };
  let slug = "";
  if (!isNew) {
    const { data: p } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
    if (!p) notFound();
    slug = p.slug;
    values = {
      id: p.id,
      name_ar: p.name_ar,
      slug: p.slug,
      category_id: p.category_id,
      description_ar: p.description_ar,
      details_ar: p.details_ar,
      care_ar: p.care_ar,
      base_price: String(p.base_price),
      discount_percent: p.discount_percent == null ? "" : String(p.discount_percent),
      personalization_fee: String(p.personalization_fee),
      sort: String(p.sort),
      is_active: p.is_active,
      images: (p.images as ProductImage[]) ?? [],
    };
  }

  return (
    <>
      <div className="adm-head">
        <div>
          <p className="adm-sub"><Link href="/admin/products">← المنتجات</Link></p>
          <h1>{isNew ? "منتج جديد" : values.name_ar}</h1>
          {sp.created && <p className="adm-ok" role="status">اتضاف المنتج.</p>}
        </div>
        {!isNew && (
          <a className="adm-btn ghost" href={`/products/${slug}`} target="_blank" rel="noreferrer">فتح في الموقع ↗</a>
        )}
      </div>
      <ProductForm values={values} categories={cats ?? []} />
    </>
  );
}
