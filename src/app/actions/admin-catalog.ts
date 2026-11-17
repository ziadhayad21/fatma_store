"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { catalogSlug, slugWithSuffix, type CatalogSlugKind } from "@/lib/admin/slug";
import { parseImages, parseMoney, SLUG_RE } from "@/lib/admin/validate";
import { publicEnv } from "@/lib/env";
import { validDiscountPercent } from "@/lib/pricing/discount";
import { invalidateCatalog } from "@/lib/revalidate";

export type SaveState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").normalize("NFC").trim();
const int = (v: string) => (/^-?\d{1,6}$/.test(v) ? Number(v) : null);
const categoryNotEmpty = "القسم لسه فيه منتجات. انقل المنتجات لقسم تاني قبل الحذف.";

async function insertCatalogRecord(
  supabase: SupabaseClient,
  table: "products" | "categories",
  kind: CatalogSlugKind,
  row: { name_ar: string } & Record<string, unknown>,
) {
  const base = catalogSlug(row.name_ar, kind);
  const candidates = [
    base,
    ...Array.from({ length: 20 }, (_, i) => slugWithSuffix(base, kind, String(i + 2))),
    slugWithSuffix(base, kind, crypto.randomUUID().slice(0, 8)),
  ].filter((slug) => SLUG_RE.test(slug));
  const { data: existing, error } = await supabase.from(table).select("slug").in("slug", candidates);
  if (error) return null;
  const taken = new Set((existing ?? []).map((record) => record.slug));

  for (const slug of candidates) {
    if (taken.has(slug)) continue;
    const { data, error: insertError } = await supabase.from(table).insert({ ...row, slug }).select("id, slug").single();
    if (!insertError) return data;
    // The UNIQUE constraint also covers another admin creating this slug after our lookup.
    if (insertError.code !== "23505") return null;
  }
  return null;
}

export async function deleteProduct(id: string): Promise<SaveState> {
  const { supabase } = await requireAdmin();
  if (!UUID.test(id)) return { ok: false, message: "منتج غير صحيح." };

  const { data, error } = await supabase.rpc("admin_delete_product", { p_id: id });
  if (error) return { ok: false, message: "تعذّر حذف المنتج. جرّب تاني." };
  const product = data as { slug: string; category_slug: string | null; archived: boolean } | null;
  if (!product) return { ok: false, message: "المنتج مش موجود." };

  invalidateCatalog({
    productSlugs: [product.slug],
    categorySlugs: product.category_slug ? [product.category_slug] : [],
  });
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${id}`);
  revalidatePath("/admin/categories");
  return {
    ok: true,
    message: product.archived ? "المنتج اتخفى من المتجر عشان مرتبط بطلبات سابقة." : "المنتج اتحذف.",
  };
}

export async function deleteCategory(id: string): Promise<SaveState> {
  const { supabase } = await requireAdmin();
  if (!UUID.test(id)) return { ok: false, message: "قسم غير صحيح." };

  const { data: assigned, error: checkError } = await supabase.from("products").select("id").eq("category_id", id).limit(1);
  if (checkError) return { ok: false, message: "تعذّر التحقق من منتجات القسم. جرّب تاني." };
  if (assigned?.length) return { ok: false, message: categoryNotEmpty };

  // The category foreign key also rejects deletion if a product was just assigned.
  const { data, error } = await supabase.from("categories").delete().eq("id", id).select("slug").maybeSingle();
  if (error?.code === "23503" || error?.code === "23001") return { ok: false, message: categoryNotEmpty };
  if (error) return { ok: false, message: "تعذّر حذف القسم. جرّب تاني." };
  if (!data) return { ok: false, message: "القسم مش موجود." };

  invalidateCatalog({ categorySlugs: [data.slug], categoryList: true });
  revalidatePath("/admin/categories");
  revalidatePath(`/admin/categories/${id}`);
  return { ok: true, message: "القسم اتحذف." };
}

// ------------------------------------------------------------------ products

export async function saveProduct(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const { supabase } = await requireAdmin();
  const errors: Record<string, string> = {};

  const id = txt(formData, "id");
  const isNew = id === "" || id === "new";
  if (!isNew && !UUID.test(id)) return { ok: false, message: "منتج غير صحيح." };

  const name_ar = txt(formData, "name_ar");
  const category_id = txt(formData, "category_id");
  const description_ar = txt(formData, "description_ar");
  const details_ar = txt(formData, "details_ar");
  const care_ar = txt(formData, "care_ar");
  const base = parseMoney(formData.get("base_price"));
  const discountEnabled = formData.get("discount_enabled") === "on";
  const discount = discountEnabled ? parseMoney(formData.get("discount_percent"), 100) : null;
  const fee = parseMoney(formData.get("personalization_fee"));
  const sort = int(txt(formData, "sort") || "0");
  const is_active = formData.get("is_active") === "on";
  const imgs = parseImages(formData.get("images"), publicEnv.supabaseUrl);

  if (name_ar.length < 1 || name_ar.length > 160) errors.name_ar = "اكتب اسم المنتج (حتى 160 حرف).";
  if (!UUID.test(category_id)) errors.category_id = "اختار القسم.";
  if (description_ar.length > 4000 || details_ar.length > 4000 || care_ar.length > 4000) errors.description_ar = "النص طويل جدًا.";
  if (base === null || base === "blank") errors.base_price = "اكتب سعرًا صحيحًا.";
  if (discountEnabled && (typeof discount !== "number" || !validDiscountPercent(discount))) {
    errors.discount_percent = "اكتب نسبة خصم أكبر من ٠ وأقل من ١٠٠.";
  }
  if (fee === null || fee === "blank") errors.personalization_fee = "اكتب تكلفة الطباعة (0 لو مجانًا).";
  if (sort === null) errors.sort = "رقم غير صحيح.";
  if (!imgs.ok) errors.images = imgs.error;
  if (Object.keys(errors).length) return { ok: false, message: "راجع الحقول المعلّمة.", fieldErrors: errors };

  // what changed? (to know which cache tags to expire)
  const { data: cats } = await supabase.from("categories").select("id, slug");
  const slugOf = new Map((cats ?? []).map((c) => [c.id as string, c.slug as string]));
  if (!slugOf.has(category_id)) return { ok: false, message: "القسم مش موجود.", fieldErrors: { category_id: "اختار قسم صحيح." } };

  let oldCategoryId: string | undefined;
  if (!isNew) {
    const { data } = await supabase.from("products").select("category_id").eq("id", id).maybeSingle();
    if (!data) return { ok: false, message: "المنتج مش موجود." };
    oldCategoryId = data.category_id;
  }

  const row = {
    name_ar,
    category_id,
    description_ar,
    details_ar,
    care_ar,
    base_price: base as number,
    discount_percent: typeof discount === "number" ? discount : null,
    personalization_fee: fee as number,
    images: imgs.ok ? imgs.images : [],
    is_active,
    sort: sort as number,
  };

  const saved = isNew
    ? await insertCatalogRecord(supabase, "products", "product", row)
    : (await supabase.from("products").update(row).eq("id", id).select("id, slug").single()).data;
  if (!saved) return { ok: false, message: "تعذّر الحفظ." };

  invalidateCatalog({
    productSlugs: [saved.slug],
    categorySlugs: [slugOf.get(category_id)!, ...(oldCategoryId && oldCategoryId !== category_id ? [slugOf.get(oldCategoryId)!] : [])].filter(Boolean),
  });

  if (isNew) redirect(`/admin/products/${saved.id}?created=1`);
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
  const description_ar = txt(formData, "description_ar");
  const promo_title_ar = txt(formData, "promo_title_ar");
  const sort = int(txt(formData, "sort") || "0");
  const is_active = formData.get("is_active") === "on";
  const imgs = parseImages(formData.get("images"), publicEnv.supabaseUrl);

  if (name_ar.length < 1 || name_ar.length > 80) errors.name_ar = "اكتب اسم القسم (حتى 80 حرف).";
  if (description_ar.length > 600) errors.description_ar = "الوصف طويل (حتى 600 حرف).";
  if (promo_title_ar.length > 120) errors.promo_title_ar = "العنوان طويل (حتى 120 حرف).";
  if (sort === null) errors.sort = "رقم غير صحيح.";
  if (!imgs.ok) errors.images = imgs.error;
  else if (imgs.images.length < 1) errors.images = "ارفع صورة للقسم.";
  if (Object.keys(errors).length) return { ok: false, message: "راجع الحقول المعلّمة.", fieldErrors: errors };

  const first = imgs.ok ? imgs.images[0] : { src: "", alt: "", position: "center" };
  const row = {
    name_ar,
    description_ar,
    promo_title_ar,
    image: first.src,
    image_alt: first.alt,
    image_position: first.position,
    sort: sort as number,
    is_active,
  };
  const saved = isNew
    ? await insertCatalogRecord(supabase, "categories", "category", row)
    : (await supabase.from("categories").update(row).eq("id", id).select("id, slug").single()).data;
  if (!saved) return { ok: false, message: "تعذّر الحفظ." };

  // the category name appears on its products' pages too
  const { data: prods } = isNew ? { data: [] } : await supabase.from("products").select("slug").eq("category_id", saved.id);
  invalidateCatalog({
    categorySlugs: [saved.slug],
    categoryList: true, // nav, footer, chips, home tiles
    productSlugs: (prods ?? []).map((p) => p.slug as string),
  });

  if (isNew) redirect(`/admin/categories/${saved.id}?created=1`);
  return { ok: true, message: "اتحفظ. التغييرات ظاهرة على الموقع دلوقتي." };
}
