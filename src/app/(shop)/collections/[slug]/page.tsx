import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DiyCard } from "@/components/shop/DiyCard";
import { ProductCard } from "@/components/shop/ProductCard";
import { Rays } from "@/components/ui/CategoryIcon";
import { Tile } from "@/components/ui/Tile";
import { getCategories, getCategory, getCollectionPage, getDiyProduct } from "@/lib/catalog";
import { breadcrumbJsonLd, jsonLdHtml } from "@/lib/structured-data";
import type { Category, ProductSort } from "@/lib/types";
import { collectionFonts } from "../_fonts";

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) return {};
  return {
    title: category.name_ar,
    description: category.description_ar,
    alternates: { canonical: `/collections/${category.slug}` },
    openGraph: { title: `${category.name_ar} | فاطمة`, description: category.description_ar, images: [category.image] },
  };
}

const SORTS: ProductSort[] = ["new", "low", "high"];
const productGrid = "grid grid-cols-2 gap-x-3 gap-y-6 lg:grid-cols-4 lg:gap-x-[24px] lg:gap-y-8";
const productImageSizes = "(min-width: 1192px) 280px, (min-width: 1024px) calc(25vw - 18px), (min-width: 640px) calc(50vw - 22px), calc(50vw - 18px)";

function parseSort(v: string | string[] | undefined): ProductSort {
  const s = Array.isArray(v) ? v[0] : v;
  return SORTS.includes(s as ProductSort) ? (s as ProductSort) : "new";
}
function parsePage(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 && n < 1000 ? n : 1;
}

export default function CollectionPage(props: PageProps<"/collections/[slug]">) {
  return (
    <Suspense fallback={<CollectionSkeleton />}>
      <CollectionContent {...props} />
    </Suspense>
  );
}

async function CollectionContent({ params, searchParams }: PageProps<"/collections/[slug]">) {
  const { slug } = await params;
  const [category, categories] = await Promise.all([getCategory(slug), getCategories()]);
  if (!category) notFound();

  return (
    <div className={`collection-page ${collectionFonts}`}>
      {/* no visible breadcrumb; the trail stays for search engines */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdHtml(
          breadcrumbJsonLd([
            { name: "الرئيسية", path: "/" },
            { name: category.name_ar, path: `/collections/${category.slug}` },
          ]),
        )}
      />
      <section className="wrap col-head">
        <span className="collection-pill-badge rise d1">اكتشف مجموعتنا</span>
        <h1 className="collection-title with-rays rise d1">
          <span className="title-rays left-rays" aria-hidden="true">
            <Rays />
          </span>
          {category.name_ar}
          <span className="title-rays right-rays" aria-hidden="true">
            <Rays flip />
          </span>
        </h1>
        <p className="collection-description rise d2">{category.description_ar}</p>
      </section>

      <section className="collection-products mx-auto max-w-[1192px] px-3 sm:px-4 lg:px-0">
        {/* searchParams (sort/page) are request-time: only the grid sits behind its own boundary */}
        <Suspense fallback={<GridSkeleton />}>
          <Grid slug={slug} searchParams={searchParams} />
        </Suspense>
      </section>

      <OtherCategories current={category.slug} categories={categories} />
    </div>
  );
}

async function Grid({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: PageProps<"/collections/[slug]">["searchParams"];
}) {
  const sp = await searchParams;
  const sort = parseSort(sp.sort);
  const [{ items, total, page, pageCount }, diy] = await Promise.all([getCollectionPage(slug, sort, parsePage(sp.page)), getDiyProduct(slug)]);
  // the DIY card leads the first page, whatever the sort
  const diyFirst = page === 1 ? diy : null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (sort !== "new") q.set("sort", sort);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `/collections/${slug}${s ? `?${s}` : ""}`;
  };

  return (
    <>
      {total === 0 && !diyFirst ? (
        <p className="muted" style={{ textAlign: "center", padding: "64px 0" }}>لسه مفيش منتجات في القسم ده.</p>
      ) : (
        <>
          <div className={productGrid}>
            {diyFirst && <DiyCard product={diyFirst} />}
            {items.map((p, i) => (
              <ProductCard key={p.slug} product={p} variant="listing" priority={i < 4} sizes={productImageSizes} />
            ))}
          </div>
        </>
      )}

      {pageCount > 1 && (
        <nav className="pager" aria-label="صفحات المنتجات">
          {page > 1 ? <Link href={href(page - 1)} rel="prev">السابق</Link> : <span aria-disabled="true">السابق</span>}
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <Link key={n} href={href(n)} aria-current={n === page ? "page" : undefined}>{n}</Link>
          ))}
          {page < pageCount ? <Link href={href(page + 1)} rel="next">التالي</Link> : <span aria-disabled="true">التالي</span>}
        </nav>
      )}
    </>
  );
}

function OtherCategories({ current, categories }: { current: string; categories: Category[] }) {
  const others = categories.filter((c) => c.slug !== current);
  if (others.length === 0) return null;
  return (
    <section className="sec others">
      <div className="wrap">
        <div className="other-categories-heading rv">
          <span className="collection-pill-badge">اكتشف كمان</span>
          <h2 className="collection-title with-rays">
            <span className="title-rays left-rays" aria-hidden="true">
              <Rays />
            </span>
            باقي الأقسام
            <span className="title-rays right-rays" aria-hidden="true">
              <Rays flip />
            </span>
          </h2>
          <p className="collection-description">اكتشف مجموعاتنا التانية المميزة</p>
        </div>
        <div className="tiles dept-grid other-category-grid">
          {others.map((c, index) => (
            <Tile
              key={c.id}
              className="dept-card"
              href={`/collections/${c.slug}`}
              src={c.image}
              alt={c.image_alt || c.name_ar}
              position={c.image_position}
              title={c.name_ar}
              accent={c.accent_color}
              sizes="(max-width: 900px) 100vw, 450px"
              custom={
                <>
                  <span className={`dept-badge dept-badge-${index === 0 ? "0" : "1"}`}>
                    {c.slug === "towels" ? "New" : "Best Seller"}
                  </span>
                  <span className="dept-shop">Shop ←</span>
                  <h3 className="dept-title">{c.name_ar}</h3>
                </>
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function GridSkeleton() {
  return (
    <div className={productGrid} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="sk aspect-[7/8] w-full max-w-full rounded-[12px] lg:w-[280px] lg:rounded-[16px]" />
      ))}
    </div>
  );
}

function CollectionSkeleton() {
  return (
    <section className="wrap col-head" aria-busy="true">
      <div className="sk" style={{ width: 240, height: 72 }} />
    </section>
  );
}
