"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { parseImages, parseMoney, SLUG_RE } from "@/lib/admin/validate";
import { publicEnv } from "@/lib/env";
import { invalidateCatalog } from "@/lib/revalidate";

export type SaveState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").normalize("NFC").trim();
const int = (v: string) => (/^-?\d{1,6}$/.test(v) ? Number(v) : null);

// ------------------------------------------------------------------ products

export async function saveProduct(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const { supabase } = await requireAdmin();
  const errors: Record<string, string> = {};

  const id = txt(formData, "id");
  const isNew = id === "" || id === "new";
  if (!isNew && !UUID.test(id)) return { ok: false, message: "منتج غير صحيح." };

  const name_ar = txt(formData, "name_ar");
  const slug = txt(formData, "slug").toLowerCase();
  const category_id = txt(formData, "category_id");
  const description_ar = txt(formData, "description_ar");
  const details_ar = txt(formData, "details_ar");
  const care_ar = txt(formData, "care_ar");
  const base = parseMoney(formData.get("base_price"));
  const fee = parseMoney(formData.get("personalization_fee"));
  const sort = int(txt(formData, "sort") || "0");
  const is_active = formData.get("is_active") === "on";
  const imgs = parseImages(formData.get("images"), publicEnv.supabaseUrl);

  if (name_ar.length < 1 || name_ar.length > 160) errors.name_ar = "اكتب اسم المنتج (حتى 160 حرف).";
  if (!SLUG_RE.test(slug) || slug.length > 80) errors.slug = "الرابط بالإنجليزي: حروف صغيرة وأرقام وشرطة (مثال: my-towel).";
  if (!UUID.test(category_id)) errors.category_id = "اختار القسم.";
  if (description_ar.length > 4000 || details_ar.length > 4000 || care_ar.length > 4000) errors.description_ar = "النص طويل جدًا.";
  if (base === null || base === "blank") errors.base_price = "اكتب سعرًا صحيحًا.";
  if (fee === null || fee === "blank") errors.personalization_fee = "اكتب تكلفة الطباعة (0 لو مجانًا).";
  if (sort === null) errors.sort = "رقم غير صحيح.";
  if (!imgs.ok) errors.images = imgs.error;
  if (Object.keys(errors).length) return { ok: false, message: "راجع الحقول المعلّمة.", fieldErrors: errors };

  // what changed? (to know which cache tags to expire)
  const { data: cats } = await supabase.from("categories").select("id, slug");
  const slugOf = new Map((cats ?? []).map((c) => [c.id as string, c.slug as string]));
  if (!slugOf.has(category_id)) return { ok: false, message: "القسم مش موجود.", fieldErrors: { category_id: "اختار قسم صحيح." } };

  let old: { slug: string; category_id: string } | null = null;
  if (!isNew) {
    const { data } = await supabase.from("products").select("slug, category_id").eq("id", id).maybeSingle();
    if (!data) return { ok: false, message: "المنتج مش موجود." };
    old = data as { slug: string; category_id: string };
  }

  const row = {
    name_ar,
    slug,
    category_id,
    description_ar,
    details_ar,
    care_ar,
    base_price: base as number,
    personalization_fee: fee as number,
    images: imgs.ok ? imgs.images : [],
    is_active,
    sort: sort as number,
  };

  const res = isNew
    ? await supabase.from("products").insert(row).select("id").single()
    : await supabase.from("products").update(row).eq("id", id).select("id").single();
  if (res.error || !res.data) {
    if (res.error?.code === "23505") return { ok: false, message: "الرابط ده مستخدم قبل كده.", fieldErrors: { slug: "الرابط ده مستخدم لمنتج تاني." } };
    return { ok: false, message: "تعذّر الحفظ." };
  }

  invalidateCatalog({
    productSlugs: [slug, ...(old && old.slug !== slug ? [old.slug] : [])],
    categorySlugs: [slugOf.get(category_id)!, ...(old && old.category_id !== category_id ? [slugOf.get(old.category_id)!] : [])].filter(Boolean),
  });

  if (isNew) redirect(`/admin/products/${res.data.id}?created=1`);
  return { ok: true, message: "اتحفظ. التغييرات ظاهرة على الموقع دلوقتي." };
}

// ------------------------------------------------------------------ categories

export async function saveCategory(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const { supabase } = await requireAdmin();
  const errors: Record<string, string> = {};

  const id = txt(formData, "id");
  const isNew = id === "" || id === "new";
  if (!isNew && !UUID.test(id)) return { ok: false, message: "قسم غير صحيح." };

  const name_ar = txt(formData, "name_ar");
  const slug = txt(formData, "slug").toLowerCase();
  const description_ar = txt(formData, "description_ar");
  const promo_title_ar = txt(formData, "promo_title_ar");
  const sort = int(txt(formData, "sort") || "0");
  const is_active = formData.get("is_active") === "on";
  const imgs = parseImages(formData.get("images"), publicEnv.supabaseUrl);

  if (name_ar.length < 1 || name_ar.length > 80) errors.name_ar = "اكتب اسم القسم (حتى 80 حرف).";
  if (!SLUG_RE.test(slug) || slug.length > 60) errors.slug = "الرابط بالإنجليزي: حروف صغيرة وأرقام وشرطة.";
  if (description_ar.length > 600) errors.description_ar = "الوصف طويل (حتى 600 حرف).";
  if (promo_title_ar.length > 120) errors.promo_title_ar = "العنوان طويل (حتى 120 حرف).";
  if (sort === null) errors.sort = "رقم غير صحيح.";
  if (!imgs.ok) errors.images = imgs.error;
  else if (imgs.images.length < 1) errors.images = "ارفع صورة للقسم.";
  if (Object.keys(errors).length) return { ok: false, message: "راجع الحقول المعلّمة.", fieldErrors: errors };

  let oldSlug: string | null = null;
  if (!isNew) {
    const { data } = await supabase.from("categories").select("slug").eq("id", id).maybeSingle();
    if (!data) return { ok: false, message: "القسم مش موجود." };
    oldSlug = data.slug as string;
    // the slug is part of public URLs (/collections/<slug>): changing it would break links
    if (oldSlug !== slug) return { ok: false, message: "رابط القسم مينفعش يتغيّر بعد الإنشاء.", fieldErrors: { slug: "رابط القسم ثابت بعد الإنشاء." } };
  }

  const first = imgs.ok ? imgs.images[0] : { src: "", alt: "", position: "center" };
  const row = {
    name_ar,
    slug,
    description_ar,
    promo_title_ar,
    image: first.src,
    image_alt: first.alt,
    image_position: first.position,
    sort: sort as number,
    is_active,
  };
  const res = isNew
    ? await supabase.from("categories").insert(row).select("id").single()
    : await supabase.from("categories").update(row).eq("id", id).select("id").single();
  if (res.error || !res.data) {
    if (res.error?.code === "23505") return { ok: false, message: "الرابط ده مستخدم.", fieldErrors: { slug: "الرابط ده مستخدم لقسم تاني." } };
    return { ok: false, message: "تعذّر الحفظ." };
  }

  // the category name appears on its products' pages too
  const { data: prods } = isNew ? { data: [] } : await supabase.from("products").select("slug").eq("category_id", res.data.id);
  invalidateCatalog({
    categorySlugs: [slug],
    categoryList: true, // nav, footer, chips, home tiles
    productSlugs: (prods ?? []).map((p) => p.slug as string),
  });

  if (isNew) redirect(`/admin/categories/${res.data.id}?created=1`);
  return { ok: true, message: "اتحفظ. التغييرات ظاهرة على الموقع دلوقتي." };
}
