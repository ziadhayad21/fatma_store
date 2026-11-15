import { cacheLife, cacheTag } from "next/cache";
import { source } from "./data/source";
import type { ShippingRate } from "./data/types";
import type { Category, Product, ProductPage, ProductSort, Review } from "./types";

/**
 * The ONLY read-access layer for catalog data (categories + products).
 *
 * Every function is cached with `use cache`, a `catalog` lifetime (see next.config.ts)
 * and tags, so pages stay in the static shell. Admin server actions call
 * `invalidateCatalog()` (lib/revalidate.ts) to expire the right tags.
 *
 * Tags:  "catalog"  — everything
 *        "products" — product lists (home, related)
 *        "shipping" — shipping_rates (checkout)
 *        "reviews" — published customer reviews (home)
 *        "categories" — the category list (nav, footer, chips, home tiles)
 *        "category:<slug>" — one category + the product lists of that category
 *        "product:<slug>" — one product
 */

export const PAGE_SIZE = 12;

export const tags = {
  catalog: "catalog",
  products: "products",
  categories: "categories",
  shipping: "shipping",
  reviews: "reviews",
  category: (slug: string) => `category:${slug}`,
  product: (slug: string) => `product:${slug}`,
};

export async function getCategories(): Promise<Category[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.catalog, tags.categories);
  return source.categories();
}

export async function getCategory(slug: string): Promise<Category | null> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.catalog, tags.categories, tags.category(slug));
  return source.category(slug);
}

/** Active products across all categories (home page). */
export async function getProducts(limit?: number): Promise<Product[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.catalog, tags.products);
  return source.products({ limit });
}

export async function getProduct(slug: string): Promise<Product | null> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.catalog, tags.product(slug));
  return source.product(slug);
}

/** One page of a collection; sorting and pagination happen in the data source. */
export async function getCollectionPage(
  categorySlug: string,
  sort: ProductSort,
  page: number,
): Promise<ProductPage> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.catalog, tags.category(categorySlug));
  return source.productPage({ categorySlug, sort, page, pageSize: PAGE_SIZE });
}

export async function getRelatedProducts(slug: string, limit = 2): Promise<Product[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.catalog, tags.products);
  return source.related(slug, limit);
}

/** Public shipping rates for the checkout selector (fee null = not set yet). */
export async function getShippingRates(): Promise<ShippingRate[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.catalog, tags.shipping);
  return source.shippingRates();
}

/** Published customer reviews for the home page (cached; the admin invalidates the "reviews" tag). */
export async function getReviews(): Promise<Review[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.catalog, tags.reviews);
  return source.reviews();
}
