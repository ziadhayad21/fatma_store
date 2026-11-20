import type { Category, Product, ProductPage, ProductSort, PublicSuggestion, Review } from "@/lib/types";

export type ShippingRate = { governorate: string; fee: number | null };

/** Read side of the catalog. Implemented by the Supabase source and by the seed fallback. */
export interface CatalogSource {
  categories(): Promise<Category[]>;
  category(slug: string): Promise<Category | null>;
  product(slug: string): Promise<Product | null>;
  products(opts?: { limit?: number }): Promise<Product[]>;
  /** one page of a collection, WITHOUT its DIY product (that one is shown separately, first) */
  productPage(opts: { categorySlug: string; sort: ProductSort; page: number; pageSize: number }): Promise<ProductPage>;
  /** the category's visible "اصنعها بنفسك" product, if any */
  diyProduct(categorySlug: string): Promise<Product | null>;
  related(slug: string, limit: number): Promise<Product[]>;
  shippingRates(): Promise<ShippingRate[]>;
  /** published reviews, in display order */
  reviews(): Promise<Review[]>;
  /** suggestions the admin made public, newest first */
  publicSuggestions(): Promise<PublicSuggestion[]>;
}
