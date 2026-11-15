import type { MetadataRoute } from "next";
import { getCategories, getProducts } from "@/lib/catalog";
import { publicEnv } from "@/lib/env";

/** Built from the same cached catalog reads as the storefront, so admin edits show up here too. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.siteUrl;
  const [categories, products] = await Promise.all([getCategories(), getProducts()]);
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    ...categories.map((c) => ({ url: `${base}/collections/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${base}/products/${p.slug}`, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
