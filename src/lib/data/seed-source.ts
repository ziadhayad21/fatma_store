import { seedCategories } from "../seed-categories";
import { seedProducts } from "../seed-products";
import { governorates } from "../governorates";
import { fromPrice } from "../pricing/discount";
import type { Category, Product, ProductRow } from "../types";
import type { CatalogSource, ShippingRate } from "./types";

/**
 * In-memory data source with the same query shapes the Supabase source will have
 * (filter by category + active, sort in the "database", range pagination).
 * Phase 4 replaces this file's implementation; `lib/catalog.ts` does not change.
 */

/** Mirrors the colours seeded by migration …1200 (every colour at the product's price). */
export const SEED_COLORS = [
  { id: "black", name_ar: "أسود", hex: "#1A1A1A" },
  { id: "white", name_ar: "أبيض", hex: "#FFFFFF" },
  { id: "pink", name_ar: "وردي", hex: "#F4A7C0" },
] as const;

export function joinSeedProduct(p: ProductRow): Product {
  const c = seedCategories.find((x) => x.id === p.category_id);
  const has_colors = !!c?.has_colors;
  return {
    ...p,
    category_slug: c?.slug ?? "",
    category_name: c?.name_ar ?? "",
    has_colors,
    colors: has_colors ? SEED_COLORS.map((col) => ({ ...col, price: p.base_price })) : [],
  };
}

/**
 * "اصنعها بنفسك" products for the seed fallback (dev / CI only). In the real database they are
 * created hidden by migration …1400 and shown from the admin.
 */
const seedDiyProducts: ProductRow[] = [
  { slug: "diy-apron", name_ar: "اصنع مريلتك بنفسك", category_id: "10000000-0000-4000-8000-000000000002" },
  { slug: "diy-towel", name_ar: "اصنع فوطتك بنفسك", category_id: "10000000-0000-4000-8000-000000000001" },
].map((p, i) => ({
  ...p,
  id: `00000000-0000-4000-8000-0000000009${i}0`,
  description_ar: "ارفع تصميمك أو اكتب الاسم اللي تحبه، وإحنا نطبعه لك.",
  details_ar: "قماش سادة جاهز للطباعة.",
  care_ar: "تغسل بماء بارد أو دافئ حتى 40 درجة، وتكوى على الظهر.",
  base_price: 150,
  images: [],
  is_active: true,
  is_diy: true,
  sort: -1,
  created_at: "2026-03-01T09:00:00.000Z",
}));

function join(): Product[] {
  const byId = new Map(seedCategories.map((c) => [c.id, c]));
  return [...seedProducts, ...seedDiyProducts]
    .filter((p) => p.is_active)
    .map(joinSeedProduct)
    .filter((p) => byId.get(p.category_id)?.is_active);
}

export const seedSource: CatalogSource = {
  async categories(): Promise<Category[]> {
    return seedCategories.filter((c) => c.is_active).sort((a, b) => a.sort - b.sort);
  },

  async category(slug: string): Promise<Category | null> {
    return seedCategories.find((c) => c.slug === slug && c.is_active) ?? null;
  },

  async product(slug: string): Promise<Product | null> {
    return join().find((p) => p.slug === slug) ?? null;
  },

  async products(opts: { limit?: number } = {}): Promise<Product[]> {
    const list = join().sort((a, b) => a.sort - b.sort);
    return opts.limit ? list.slice(0, opts.limit) : list;
  },

  async productPage(opts) {
    const all = join().filter((p) => p.category_slug === opts.categorySlug && !p.is_diy);
    const sorted = [...all].sort((a, b) => {
      if (opts.sort === "low") return fromPrice(a).price - fromPrice(b).price || a.sort - b.sort;
      if (opts.sort === "high") return fromPrice(b).price - fromPrice(a).price || a.sort - b.sort;
      return b.created_at.localeCompare(a.created_at) || a.sort - b.sort; // newest first
    });
    const total = sorted.length;
    const pageCount = Math.max(1, Math.ceil(total / opts.pageSize));
    const page = Math.min(Math.max(1, opts.page), pageCount);
    const from = (page - 1) * opts.pageSize;
    return { items: sorted.slice(from, from + opts.pageSize), total, page, pageCount };
  },

  async diyProduct(categorySlug) {
    return join().find((p) => p.category_slug === categorySlug && p.is_diy) ?? null;
  },

  /** other active products, same category first */
  async related(slug, limit) {
    const all = join().sort((a, b) => a.sort - b.sort);
    const me = all.find((p) => p.slug === slug);
    const others = all.filter((p) => p.slug !== slug);
    others.sort((a, b) => Number(b.category_id === me?.category_id) - Number(a.category_id === me?.category_id));
    return others.slice(0, limit);
  },

  async reviews() {
    return []; // never fake reviews: the home page hides the section until real ones are published
  },

  /** mirrors the one sample public suggestion inserted by migration …1400 */
  async publicSuggestions() {
    return [
      {
        text: "عايزين تضيفوا مريلة أطفال بأسامي الولاد",
        status: "reviewing",
        admin_reply: "فكرة حلوة! بندرسها دلوقتي.",
        created_at: "2026-11-20T00:00:00.000Z",
      },
    ];
  },

  async shippingRates(): Promise<ShippingRate[]> {
    // seed mode: fees unset, exactly like the production seed
    return governorates.map((g) => ({ governorate: g, fee: null }));
  },
};
