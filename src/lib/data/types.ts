import type { Category, Product, ProductPage, ProductSort } from "@/lib/types";

export type ShippingRate = { governorate: string; fee: number | null };

/** Read side of the catalog. Implemented by the Supabase source and by the seed fallback. */
export interface CatalogSource {
  categories(): Promise<Category[]>;
  category(slug: string): Promise<Category | null>;
  product(slug: string): Promise<Product | null>;
  products(opts?: { limit?: number }): Promise<Product[]>;
  productPage(opts: { categorySlug: string; sort: ProductSort; page: number; pageSize: number }): Promise<ProductPage>;
  related(slug: string, limit: number): Promise<Product[]>;
  shippingRates(): Promise<ShippingRate[]>;
}
