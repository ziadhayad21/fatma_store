import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Inter, Poppins } from "next/font/google";
import { ProductCard } from "@/components/shop/ProductCard";
import { CategoryIcon, Rays } from "@/components/ui/CategoryIcon";
import { Icon } from "@/components/ui/Icon";
import { getCategories, getCategory, getCollectionPage } from "@/lib/catalog";
import type { Category, ProductSort } from "@/lib/types";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-inter" });
const poppins = Poppins({ subsets: ["latin"], weight: ["500", "600", "700"], display: "swap", variable: "--font-poppins" });

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
    <div className={`collection-page ${inter.variable} ${poppins.variable}`}>
      <section className="wrap col-head">
        <nav className="crumb rise" aria-label="مسار الصفحة">
          <Link href="/">الرئيسية</Link>
          <span aria-hidden="true">/</span>
          <span style={{ color: "var(--ink)" }}>{category.name_ar}</span>
        </nav>
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

      <section className="wrap collection-products">
        {/* searchParams (sort/page) are request-time: only the grid sits behind its own boundary */}
        <Suspense fallback={<GridSkeleton />}>
          <Grid slug={slug} category={category} searchParams={searchParams} />
        </Suspense>
      </section>

      <OtherCategories current={category.slug} categories={categories} />
    </div>
  );
}

async function Grid({
  slug,
  category,
  searchParams,
}: {
  slug: string;
  category: Category;
  searchParams: PageProps<"/collections/[slug]">["searchParams"];
}) {
  const sp = await searchParams;
  const sort = parseSort(sp.sort);
  const { items, total, page, pageCount } = await getCollectionPage(slug, sort, parsePage(sp.page));
  // promo tile only while the collection is thin (fewer than 3 products)
  const showPromo = total < 3 && items.length > 0;
  const promoTarget = items[0];
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (sort !== "new") q.set("sort", sort);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `/collections/${slug}${s ? `?${s}` : ""}`;
  };

  return (
    <>
      {total === 0 ? (
        <p className="muted" style={{ textAlign: "center", padding: "64px 0" }}>لسه مفيش منتجات في القسم ده.</p>
      ) : (
        <div className={`cgrid landscape-grid${showPromo ? " has-promo" : ""}`}>
          {showPromo && promoTarget && (
            <div className="dept-landscape-card promo-landscape-card rise d3">
              <Image
                src={category.image}
                alt={category.image_alt}
                fill
                sizes="(max-width: 900px) 100vw, 650px"
                style={{ objectPosition: category.image_position, objectFit: "cover" }}
              />
              <div className="card-shade promo-shade" />

              <div className="card-top-badge">
                <CategoryIcon slug={category.slug} />
                <span>{category.name_ar}</span>
              </div>

              <div className="promo-card-body">
                <div className="promo-rays" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffb91f" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M4 14L2 17" />
                    <path d="M7 9L4 6" />
                    <path d="M14 6L16 2" />
                  </svg>
                </div>
                <h2 className="promo-card-title">
                  {category.promo_title_ar || "اطلب باسمك أو بتصميمك"}
                </h2>
                <Link href={`/products/${promoTarget.slug}`} className="btn-promo-action">
                  <span>ابدأ التخصيص</span>
                  <Icon name="arrow" size={16} nudge />
                </Link>
              </div>

              <div className="card-doodle-heart" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </div>
            </div>
          )}
          {items.map((p, i) => (
            <ProductCard
              key={p.slug}
              product={p}
              variant="landscape"
              categoryName={category.name_ar}
              categorySlug={category.slug}
              className="rise d3"
              priority={i < 3}
              sizes="(max-width: 900px) 100vw, 650px"
            />
          ))}
        </div>
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
        <div className="g2 other-category-grid">
          {others.map((c) => (
            <div key={c.id} className="dept-landscape-card other-dept-card rv-clip">
              <Image
                src={c.image}
                alt={c.image_alt || c.name_ar}
                fill
                sizes="(max-width: 900px) 100vw, 650px"
                style={{ objectPosition: c.image_position, objectFit: "cover" }}
              />
              <div className="card-shade dept-shade" />

              <div className="card-top-badge">
                <CategoryIcon slug={c.slug} />
                <span>{c.name_ar}</span>
              </div>

              <div className="dept-card-bottom-bar">
                <Link href={`/collections/${c.slug}`} className="btn-shop-now">
                  <span>تسوّق {c.name_ar}</span>
                  <Icon name="arrow" size={16} nudge />
                </Link>
              </div>

              {c.slug === "bags" && (
                <div className="card-doodle-sun" aria-hidden="true">
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <path d="M24 6V2M24 46V42M6 24H2M46 24H42M11.29 11.29L8.46 8.46M39.54 39.54L36.71 36.71M11.29 36.71L8.46 39.54M39.54 8.46L36.71 11.29" stroke="#ffb91f" strokeWidth="2.5" strokeLinecap="round"/>
                    <circle cx="24" cy="24" r="10" fill="#ffb91f" opacity="0.9"/>
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GridSkeleton() {
  return (
    <div className="cgrid" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="sk" style={{ aspectRatio: "3/4" }} />
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
