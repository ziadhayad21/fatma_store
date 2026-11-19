import { createPublicClient } from "@/lib/supabase/public";
import type { Category, ColorOption, Product, ProductImage, ProductPage, ProductRow, Review } from "@/lib/types";
import type { CatalogSource, ShippingRate } from "./types";

type JoinedColor = {
  price: number | string;
  is_available: boolean;
  color: { id: string; name_ar: string; hex: string; sort: number; is_active: boolean } | null;
};

export type JoinedRow = Omit<ProductRow, "base_price" | "discount_percent" | "images"> & {
  base_price: number | string;
  discount_percent?: number | string | null;
  images: ProductImage[] | null;
  category: { slug: string; name_ar: string; is_active: boolean; has_colors?: boolean | null } | null;
  product_colors?: JoinedColor[] | null;
  /** legacy column (always 0 since the printing fee was removed); never read */
  personalization_fee?: unknown;
};

export const PRODUCT_SELECT =
  "*, category:categories!inner(slug, name_ar, is_active, has_colors), product_colors(price, is_available, color:colors(id, name_ar, hex, sort, is_active))";

/** Available, active colours in display order. */
function toColors(rows: JoinedColor[] | null | undefined): ColorOption[] {
  return (rows ?? [])
    .filter((r) => r.is_available && r.color?.is_active)
    .sort((a, b) => a.color!.sort - b.color!.sort || a.color!.id.localeCompare(b.color!.id))
    .map((r) => ({ id: r.color!.id, name_ar: r.color!.name_ar, hex: r.color!.hex, price: Number(r.price) }));
}

export function toProduct(r: JoinedRow): Product {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip join-only / legacy fields
  const { category, product_colors, personalization_fee, ...row } = r;
  const has_colors = !!category?.has_colors;
  return {
    ...row,
    base_price: Number(r.base_price),
    discount_percent: r.discount_percent == null ? null : Number(r.discount_percent),
    images: Array.isArray(r.images) ? r.images : [],
    category_slug: category?.slug ?? "",
    category_name: category?.name_ar ?? "",
    has_colors,
    colors: has_colors ? toColors(product_colors) : [],
  };
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`Supabase ${what} failed: ${error.message}`);
}

/** Public reads through the publishable key — RLS limits everything to active rows. */
export const supabaseSource: CatalogSource = {
  async reviews() {
    const { data, error } = await createPublicClient()
      .from("reviews")
      .select("id, customer_name, text, avatar_color, product:products(name_ar)")
      .eq("is_published", true)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) {
      // a missing/unavailable table must never take the home page down: no reviews = no section
      console.error("reviews read failed:", error.message);
      return [];
    }
    return (data ?? []).map((r) => {
      const product = r.product as { name_ar: string } | { name_ar: string }[] | null;
      const name = Array.isArray(product) ? product[0]?.name_ar : product?.name_ar;
      return {
        id: r.id as string,
        customer_name: r.customer_name as string,
        text: r.text as string,
        avatar_color: (r.avatar_color as string | null) ?? null,
        product_name: name ?? null,
      } satisfies Review;
    });
  },

  async categories() {
    const { data, error } = await createPublicClient()
      .from("categories")
      .select("*")
      .eq("is_active", true)
      .order("sort", { ascending: true });
    if (error) fail("categories", error);
    return (data ?? []) as Category[];
  },

  async category(slug) {
    const { data, error } = await createPublicClient()
      .from("categories")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) fail("category", error);
    return (data as Category | null) ?? null;
  },

  async product(slug) {
    const { data, error } = await createPublicClient()
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("slug", slug)
      .eq("is_active", true)
      .eq("category.is_active", true)
      .maybeSingle();
    if (error) fail("product", error);
    return data ? toProduct(data as unknown as JoinedRow) : null;
  },

  async products(opts = {}) {
    let q = createPublicClient()
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("is_active", true)
      .eq("category.is_active", true)
      .order("sort", { ascending: true });
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) fail("products", error);
    return ((data ?? []) as unknown as JoinedRow[]).map(toProduct);
  },

  async productPage({ categorySlug, sort, page, pageSize }): Promise<ProductPage> {
    const run = async (p: number, priceColumn = "sale_price") => {
      let q = createPublicClient()
        .from("products")
        .select(PRODUCT_SELECT, { count: "exact" })
        .eq("is_active", true)
        .eq("category.slug", categorySlug)
        .eq("category.is_active", true);
      if (sort === "low") q = q.order(priceColumn, { ascending: true }).order("sort", { ascending: true });
      else if (sort === "high") q = q.order(priceColumn, { ascending: false }).order("sort", { ascending: true });
      else q = q.order("created_at", { ascending: false }).order("sort", { ascending: true });
      const from = (p - 1) * pageSize;
      return q.range(from, from + pageSize - 1);
    };

    let current = Math.max(1, page);
    let res = await run(current);
    // Keep older databases readable during a schema-first rollout.
    const priceColumn = res.error?.code === "42703" && sort !== "new" ? "base_price" : "sale_price";
    if (priceColumn === "base_price") res = await run(current, priceColumn);
    // out-of-range page (e.g. products were removed): clamp to the last page
    if (res.error?.code === "PGRST103" || (!res.error && (res.data ?? []).length === 0 && current > 1)) {
      const total = res.count ?? 0;
      current = Math.max(1, Math.ceil(total / pageSize));
      res = await run(current, priceColumn);
    }
    if (res.error) fail("collection page", res.error);
    const total = res.count ?? 0;
    return {
      items: ((res.data ?? []) as unknown as JoinedRow[]).map(toProduct),
      total,
      page: current,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  },

  async related(slug, limit) {
    const all = await this.products();
    const me = all.find((p) => p.slug === slug);
    const others = all.filter((p) => p.slug !== slug);
    others.sort((a, b) => Number(b.category_id === me?.category_id) - Number(a.category_id === me?.category_id));
    return others.slice(0, limit);
  },

  async shippingRates(): Promise<ShippingRate[]> {
    const { data, error } = await createPublicClient().from("shipping_rates").select("governorate, fee");
    if (error) fail("shipping rates", error);
    return (data ?? []).map((r) => ({ governorate: r.governorate as string, fee: r.fee === null ? null : Number(r.fee) }));
  },
};
