import { ShopChrome } from "@/components/layout/ShopChrome";

/**
 * Opts the storefront out of Next's DEV-ONLY "instant navigation" validation (partialPrefetching insight).
 * That check logs a "URL data outside of Suspense" error on every route here even though `params` /
 * `searchParams` are read inside <Suspense> boundaries; it never affects the build or production output.
 * Prefetching still works as configured in next.config.ts.
 */
export const instant = false;

export default function ShopLayout({ children }: LayoutProps<"/">) {
  return <ShopChrome>{children}</ShopChrome>;
}
