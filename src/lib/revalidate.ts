import { revalidatePath, updateTag } from "next/cache";
import { tags } from "./catalog";

/**
 * Call from admin Server Actions after any catalog write.
 *
 * - `updateTag` expires the tagged data caches immediately (read-your-own-writes).
 * - `revalidatePath` also drops the prerendered route entries for the pages that show the data.
 *   Without it, a statically prerendered product page can serve its previous HTML for one more request.
 *
 * Only works inside Server Actions.
 */
export function invalidateShipping() {
  updateTag(tags.shipping);
  revalidatePath("/checkout");
}

export function invalidateCatalog(opts: {
  productSlugs?: string[];
  categorySlugs?: string[];
  /** set when a category was added/renamed/reordered/hidden (nav, footer, chips, home tiles) */
  categoryList?: boolean;
}) {
  for (const s of opts.productSlugs ?? []) {
    updateTag(tags.product(s));
    revalidatePath(`/products/${s}`);
  }
  for (const s of opts.categorySlugs ?? []) {
    updateTag(tags.category(s));
    revalidatePath(`/collections/${s}`);
  }
  if (opts.categoryList) {
    updateTag(tags.categories);
    revalidatePath("/", "layout"); // nav + footer live in the root layout
  }
  updateTag(tags.products); // home product list + related products
  revalidatePath("/");
  // "catalog" is the flush-everything tag; use updateTag(tags.catalog) for bulk imports
}

/** After any admin change to suggestions (public toggle, status, reply). */
export function invalidateSuggestions() {
  updateTag(tags.suggestions);
  revalidatePath("/");
}

/** After any change to reviews (add / edit / publish / hide / reorder / delete). */
export function invalidateReviews() {
  updateTag(tags.reviews);
  revalidatePath("/");
}
