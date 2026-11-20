"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { catalogSlug, slugWithSuffix, type CatalogSlugKind } from "@/lib/admin/slug";
import { parseImages, parseMoney, SLUG_RE } from "@/lib/admin/validate";
import { publicEnv } from "@/lib/env";
import { DEFAULT_PIECE_LABELS, PIECE_LABEL_MAX } from "@/lib/couples";
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
  /** a slug the admin typed for a new record (cleaned the same way); otherwise it comes from the name */
  wanted?: string,
) {
  const base = wanted ? catalogSlug(wanted, kind) : catalogSlug(row.name_ar, kind);
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
  const discountEnabled = formData.get("discount_enabled") === "on";
  const discount = discountEnabled ? parseMoney(formData.get("discount_percent"), 100) : null;
  const sort = int(txt(formData, "sort") || "0");
  const is_active = formData.get("is_active") === "on";
  const is_diy = formData.get("is_diy") === "on";
  const couples = formData.get("is_couples") === "on";
  const piece_labels = couples
    ? [1, 2].map((n, i) => txt(formData, `piece_label_${n}`) || DEFAULT_PIECE_LABELS[i])
    : null;
  piece_labels?.forEach((l, i) => {
    if ([...l].length > PIECE_LABEL_MAX) errors[`piece_label_${i + 1}`] = `الاسم طويل (حتى ${PIECE_LABEL_MAX} حرف).`;
  });
  const imgs = parseImages(formData.get("images"), publicEnv.supabaseUrl);

  if (name_ar.length < 1 || name_ar.length > 160) errors.name_ar = "اكتب اسم المنتج (حتى 160 حرف).";
  if (!UUID.test(category_id)) errors.category_id = "اختار القسم.";
  if (description_ar.length > 4000 || details_ar.length > 4000 || care_ar.length > 4000) errors.description_ar = "النص طويل جدًا.";
  if (discountEnabled && (typeof discount !== "number" || !validDiscountPercent(discount))) {
    errors.discount_percent = "اكتب نسبة خصم أكبر من ٠ وأقل من ١٠٠.";
  }
  if (sort === null) errors.sort = "رقم غير صحيح.";
  if (!imgs.ok) errors.images = imgs.error;

  // what changed? (to know which cache tags to expire) + does this category sell by colour?
  const { data: cats } = await supabase.from("categories").select("id, slug, has_colors, allows_couples");
  const slugOf = new Map((cats ?? []).map((c) => [c.id as string, c.slug as string]));
  if (UUID.test(category_id) && !slugOf.has(category_id)) errors.category_id = "اختار قسم صحيح.";
  const hasColors = !!cats?.find((c) => c.id === category_id)?.has_colors;
  if (couples && UUID.test(category_id) && !cats?.find((c) => c.id === category_id)?.allows_couples) {
    errors.product_type = "القسم ده مش بيسمح بمنتجات كابلز. اختار نوع تاني أو قسم تاني.";
  }
  // new products may get a hand-typed slug (existing ones keep theirs: carts and links point to it)
  const wantedSlug = isNew ? txt(formData, "slug").toLowerCase() : "";
  if (wantedSlug && !SLUG_RE.test(catalogSlug(wantedSlug, "product"))) errors.slug = "الرابط لازم يكون حروف إنجليزي وأرقام وشرطة (-) بس.";

  // One price per product, or one per colour. The ordering option never changes it.
  // Couples products: ONE fixed price for the pair; their colours are only switched on/off (each colour
  // row carries that same price, so base_price = the lowest available colour price stays true).
  let base: number | null = null;
  let colorRows: { color_id: string; price: number; is_available: boolean }[] = [];
  if (couples) {
    const parsed = parseMoney(formData.get("base_price"));
    if (parsed === null || parsed === "blank") errors.base_price = "اكتب سعر الكابلز.";
    else base = parsed;
    if (hasColors) {
      const { data: colors, error: colorsError } = await supabase.from("colors").select("id").eq("is_active", true);
      if (colorsError) return { ok: false, message: "تعذّر تحميل الألوان. جرّب تاني." };
      colorRows = (colors ?? []).map(({ id: colorId }) => ({
        color_id: colorId as string,
        price: typeof base === "number" ? base : 0,
        is_available: formData.get(`color_available_${colorId}`) === "on",
      }));
      if (!colorRows.some((c) => c.is_available)) errors.colors = "فعّل لون واحد على الأقل.";
    }
  } else if (hasColors) {
    const { data: colors, error: colorsError } = await supabase.from("colors").select("id").eq("is_active", true);
    if (colorsError) return { ok: false, message: "تعذّر تحميل الألوان. جرّب تاني." };
    for (const { id: colorId } of colors ?? []) {
      const available = formData.get(`color_available_${colorId}`) === "on";
      const price = parseMoney(formData.get(`color_price_${colorId}`));
      if (price === null || (available && price === "blank")) {
        errors[`color_${colorId}`] = "اكتب سعرًا صحيحًا للون ده.";
      } else if (typeof price === "number") {
        // an unavailable colour keeps its price for later; with no price it is simply removed
        colorRows.push({ color_id: colorId as string, price, is_available: available });
      }
    }
    const prices = colorRows.filter((c) => c.is_available).map((c) => c.price);
    if (prices.length === 0 && !Object.keys(errors).some((k) => k.startsWith("color_"))) errors.colors = "فعّل لون واحد على الأقل واكتب سعره.";
    base = prices.length ? Math.min(...prices) : null;
  } else {
    const parsed = parseMoney(formData.get("base_price"));
    if (parsed === null || parsed === "blank") errors.base_price = "اكتب سعرًا صحيحًا.";
    else base = parsed;
  }
  if (Object.keys(errors).length) return { ok: false, message: "راجع الحقول المعلّمة.", fieldErrors: errors };
  if (!hasColors) colorRows = [];

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
    images: imgs.ok ? imgs.images : [],
    is_active,
    is_diy,
    pieces_count: couples ? 2 : 1,
    piece_labels,
    sort: sort as number,
  };

  const saved = isNew
    ? await insertCatalogRecord(supabase, "products", "product", row, wantedSlug || undefined)
    : (await supabase.from("products").update(row).eq("id", id).select("id, slug").single()).data;
  if (!saved) return { ok: false, message: "تعذّر الحفظ." };

  // colour prices, atomically (the RPC also re-syncs base_price to the lowest available colour price)
  if (hasColors) {
    const { error: colorError } = await supabase.rpc("admin_save_product_colors", { p_product_id: saved.id, p_colors: colorRows });
    if (colorError) {
      console.error("saveProduct: colours", colorError.message);
      invalidateCatalog({ productSlugs: [saved.slug], categorySlugs: [slugOf.get(category_id)!] });
      // a new product exists now: continue on its edit page so a retry does not create a duplicate
      if (isNew) redirect(`/admin/products/${saved.id}?colors=failed`);
      return { ok: false, message: "المنتج اتحفظ لكن أسعار الألوان ما اتحفظتش. جرّب تحفظ تاني." };
    }
  }

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
  const has_colors = formData.get("has_colors") === "on";
  const allows_couples = formData.get("allows_couples") === "on";
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
    has_colors,
    allows_couples,
  };
  let hadColors = false;
  if (!isNew) {
    const { data: before } = await supabase.from("categories").select("has_colors").eq("id", id).maybeSingle();
    hadColors = !!before?.has_colors;
  }
  const saved = isNew
    ? await insertCatalogRecord(supabase, "categories", "category", row)
    : (await supabase.from("categories").update(row).eq("id", id).select("id, slug").single()).data;
  if (!saved) return { ok: false, message: "تعذّر الحفظ." };

  // the category name appears on its products' pages too
  const { data: prods } = isNew ? { data: [] } : await supabase.from("products").select("id, slug, base_price").eq("category_id", saved.id);

  // Turning colours on: every product starts in every active colour at its current price
  // (edit each product to change prices or switch colours off).
  if (has_colors && !hadColors && prods?.length) {
    const { data: colors } = await supabase.from("colors").select("id").eq("is_active", true);
    const rows = prods.flatMap((p) => (colors ?? []).map((c) => ({ product_id: p.id, color_id: c.id, price: Number(p.base_price), is_available: true })));
    if (rows.length) {
      const { error: colorError } = await supabase.from("product_colors").upsert(rows, { onConflict: "product_id,color_id", ignoreDuplicates: true });
      if (colorError) return { ok: false, message: "القسم اتحفظ لكن ألوان المنتجات ما اتجهزتش. جرّب تحفظ تاني." };
    }
  }
  invalidateCatalog({
    categorySlugs: [saved.slug],
    categoryList: true, // nav, footer, chips, home tiles
    productSlugs: (prods ?? []).map((p) => p.slug as string),
  });

  if (isNew) redirect(`/admin/categories/${saved.id}?created=1`);
  return { ok: true, message: "اتحفظ. التغييرات ظاهرة على الموقع دلوقتي." };
}
