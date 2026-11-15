"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { invalidateReviews } from "@/lib/revalidate";

export type ReviewState = { ok: boolean; message: string; fieldErrors?: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveReview(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const { supabase } = await requireAdmin();
  const id = txt(formData, "id");
  const isNew = id === "" || id === "new";
  if (!isNew && !UUID.test(id)) return { ok: false, message: "رأي غير صحيح." };

  const customer_name = txt(formData, "customer_name");
  const text = txt(formData, "text");
  const product_id = txt(formData, "product_id");
  const avatar_color = txt(formData, "avatar_color").toUpperCase();
  const sortRaw = txt(formData, "sort") || "0";
  const sort = /^-?\d{1,6}$/.test(sortRaw) ? Number(sortRaw) : null;
  const is_published = formData.get("is_published") === "on";

  const errors: Record<string, string> = {};
  if (customer_name.length < 1 || customer_name.length > 80) errors.customer_name = "اكتب اسم العميل (حتى 80 حرف).";
  if (text.length < 1 || text.length > 600) errors.text = "اكتب الرأي (حتى 600 حرف).";
  if (product_id && !UUID.test(product_id)) errors.product_id = "منتج غير صحيح.";
  if (avatar_color && !/^#[0-9A-F]{6}$/.test(avatar_color)) errors.avatar_color = "لون غير صحيح.";
  if (sort === null) errors.sort = "رقم غير صحيح.";
  if (Object.keys(errors).length) return { ok: false, message: "راجع الحقول المعلّمة.", fieldErrors: errors };

  // saving through the form means the review is now the admin's own: it is no longer a sample
  const row = { customer_name, text, product_id: product_id || null, avatar_color: avatar_color || null, is_published, sort: sort as number, is_sample: false };
  const res = isNew
    ? await supabase.from("reviews").insert(row).select("id").single()
    : await supabase.from("reviews").update(row).eq("id", id).select("id").single();
  if (res.error || !res.data) return { ok: false, message: "تعذّر الحفظ." };

  invalidateReviews();
  if (isNew) redirect(`/admin/reviews/${res.data.id}?created=1`);
  return { ok: true, message: "اتحفظ. التغييرات ظاهرة على الموقع دلوقتي." };
}

/** Show / hide from the list. */
export async function setReviewPublished(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const id = txt(formData, "id");
  if (!UUID.test(id)) return;
  await supabase.from("reviews").update({ is_published: formData.get("publish") === "1" }).eq("id", id);
  invalidateReviews();
  redirect("/admin/reviews");
}

/** Move one review up or down: renumber everything (10, 20, 30...) and swap with the neighbour. */
export async function moveReview(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const id = txt(formData, "id");
  const dir = txt(formData, "dir");
  if (!UUID.test(id) || (dir !== "up" && dir !== "down")) return;
  const { data } = await supabase.from("reviews").select("id").order("sort", { ascending: true }).order("created_at", { ascending: false });
  const ids = (data ?? []).map((r) => r.id as string);
  const i = ids.indexOf(id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await Promise.all(ids.map((rid, n) => supabase.from("reviews").update({ sort: (n + 1) * 10 }).eq("id", rid)));
  invalidateReviews();
  redirect("/admin/reviews");
}

/** Deletes every review marked as a sample (the placeholders); real reviews are never touched. */
export async function deleteSampleReviews(): Promise<void> {
  const { supabase } = await requireAdmin();
  await supabase.from("reviews").delete().eq("is_sample", true);
  invalidateReviews();
  redirect("/admin/reviews");
}
