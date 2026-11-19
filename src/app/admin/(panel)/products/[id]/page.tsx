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

  const [{ data: cats }, { data: colors }] = await Promise.all([
    supabase.from("categories").select("id, name_ar, has_colors").order("sort"),
    supabase.from("colors").select("id, name_ar, hex").eq("is_active", true).order("sort"),
  ]);
  // every active colour, with this product's saved price / availability (new products: all available, no price yet)
  const colorValues = (saved: { color_id: string; price: number | string; is_available: boolean }[] | null) =>
    (colors ?? []).map((c) => {
      const row = saved?.find((x) => x.color_id === c.id);
      return { id: c.id as string, name_ar: c.name_ar as string, hex: c.hex as string, available: row ? row.is_available : !saved?.length, price: row ? String(Number(row.price)) : "" };
    });
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
    sort: "0",
    is_active: true,
    images: [],
    colors: colorValues(null),
  };
  let slug = "";
  if (!isNew) {
    const [{ data: p }, { data: saved }] = await Promise.all([
      supabase.from("products").select("*").eq("id", id).maybeSingle(),
      supabase.from("product_colors").select("color_id, price, is_available").eq("product_id", id),
    ]);
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
      sort: String(p.sort),
      is_active: p.is_active,
      images: (p.images as ProductImage[]) ?? [],
      // a colour product without saved colours yet starts from its current price in every colour
      colors: saved?.length ? colorValues(saved) : colorValues(null).map((c) => ({ ...c, price: String(Number(p.base_price)) })),
    };
  }

  return (
    <>
      <div className="adm-head">
        <div>
          <p className="adm-sub"><Link href="/admin/products">← المنتجات</Link></p>
          <h1>{isNew ? "منتج جديد" : values.name_ar}</h1>
          {sp.created && <p className="adm-ok" role="status">اتضاف المنتج.</p>}
          {sp.colors === "failed" && <p className="adm-err" role="alert">المنتج اتضاف لكن أسعار الألوان ما اتحفظتش. راجعها واضغط حفظ.</p>}
        </div>
        {!isNew && (
          <a className="adm-btn ghost" href={`/products/${slug}`} target="_blank" rel="noreferrer">فتح في الموقع ↗</a>
        )}
      </div>
      <ProductForm values={values} categories={(cats ?? []).map((c) => ({ id: c.id, name_ar: c.name_ar, has_colors: !!c.has_colors }))} />
    </>
  );
}
