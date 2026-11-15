import { seedCategories } from "../seed-categories";
import { seedProducts } from "../seed-products";
import { governorates } from "../governorates";
import type { Category, Product } from "../types";
import type { CatalogSource, ShippingRate } from "./types";

/**
 * In-memory data source with the same query shapes the Supabase source will have
 * (filter by category + active, sort in the "database", range pagination).
 * Phase 4 replaces this file's implementation; `lib/catalog.ts` does not change.
 */

function join(): Product[] {
  const byId = new Map(seedCategories.map((c) => [c.id, c]));
  return seedProducts
    .filter((p) => p.is_active)
    .map((p) => {
      const c = byId.get(p.category_id);
      return { ...p, category_slug: c?.slug ?? "", category_name: c?.name_ar ?? "" };
    })
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
    const all = join().filter((p) => p.category_slug === opts.categorySlug);
    const sorted = [...all].sort((a, b) => {
      if (opts.sort === "low") return a.base_price - b.base_price || a.sort - b.sort;
      if (opts.sort === "high") return b.base_price - a.base_price || a.sort - b.sort;
      return b.created_at.localeCompare(a.created_at) || a.sort - b.sort; // newest first
    });
    const total = sorted.length;
    const pageCount = Math.max(1, Math.ceil(total / opts.pageSize));
    const page = Math.min(Math.max(1, opts.page), pageCount);
    const from = (page - 1) * opts.pageSize;
    return { items: sorted.slice(from, from + opts.pageSize), total, page, pageCount };
  },

  /** other active products, same category first */
  async related(slug, limit) {
    const all = join().sort((a, b) => a.sort - b.sort);
    const me = all.find((p) => p.slug === slug);
    const others = all.filter((p) => p.slug !== slug);
    others.sort((a, b) => Number(b.category_id === me?.category_id) - Number(a.category_id === me?.category_id));
    return others.slice(0, limit);
  },

  async shippingRates(): Promise<ShippingRate[]> {
    // seed mode: fees unset, exactly like the production seed
    return governorates.map((g) => ({ governorate: g, fee: null }));
  },
};
