import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewForm, type ReviewFormValues } from "@/components/admin/ReviewForm";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata = { title: "تعديل رأي" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ReviewEdit({ params, searchParams }: PageProps<"/admin/reviews/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "new";
  if (!isNew && !UUID.test(id)) notFound();
  const { supabase } = await requireAdmin();

  const { data: products } = await supabase.from("products").select("id, name_ar").order("sort");
  let values: ReviewFormValues = { id: "new", customer_name: "", text: "", product_id: "", avatar_color: "", sort: "0", is_published: false };
  if (!isNew) {
    const { data: r } = await supabase.from("reviews").select("*").eq("id", id).maybeSingle();
    if (!r) notFound();
    values = {
      id: r.id,
      customer_name: r.customer_name,
      text: r.text,
      product_id: r.product_id ?? "",
      avatar_color: (r.avatar_color as string | null)?.toUpperCase() ?? "",
      sort: String(r.sort),
      is_published: r.is_published,
    };
  }
  return (
    <>
      <div className="adm-head">
        <div>
          <p className="adm-sub"><Link href="/admin/reviews">← الآراء</Link></p>
          <h1>{isNew ? "رأي جديد" : values.customer_name}</h1>
          {sp.created && <p className="adm-ok" role="status">اتضاف الرأي.</p>}
        </div>
      </div>
      <ReviewForm values={values} products={products ?? []} />
    </>
  );
}
