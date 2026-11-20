import { publicEnv } from "./env";

/** Absolute URL on the site (structured data needs absolute URLs). */
export const absoluteUrl = (path: string) => (path.startsWith("http") ? path : `${publicEnv.siteUrl}${path}`);

/**
 * schema.org BreadcrumbList for search engines. The pages no longer show a visible breadcrumb,
 * but the trail stays in the page as JSON-LD.
 */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}

/** JSON for a <script type="application/ld+json">: "<" escaped so a name can never close the script tag. */
export const jsonLdHtml = (data: unknown) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });
