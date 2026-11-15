"use server";

import { getProduct } from "@/lib/catalog";
import type { Product } from "@/lib/types";

/** Public product data for cart lines. Each product read hits the tagged catalog cache. */
export async function getCartProducts(slugs: string[]): Promise<Product[]> {
  const unique = [...new Set(slugs)].slice(0, 50);
  const found = await Promise.all(unique.map((s) => getProduct(s)));
  return found.filter((p): p is Product => p !== null);
}
