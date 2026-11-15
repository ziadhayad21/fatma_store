import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductCard } from "@/components/shop/ProductCard";
import { SortSelect } from "@/components/shop/SortSelect";
import { Icon } from "@/components/ui/Icon";
import { Tile } from "@/components/ui/Tile";
import { getCategories, getCategory, getCollectionPage } from "@/lib/catalog";
import type { Category, ProductSort } from "@/lib/types";

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
    <>
      <section className="wrap col-head">
        <nav className="crumb rise" aria-label="مسار الصفحة">
          <Link href="/">الرئيسية</Link>
          <span aria-hidden="true">/</span>
          <span style={{ color: "var(--ink)" }}>{category.name_ar}</span>
        </nav>
        <h1 className="rise d1" style={{ fontSize: "clamp(44px, 5.4vw, 76px)", lineHeight: 1.05 }}>{category.name_ar}</h1>
        <p className="muted rise d2" style={{ margin: 0, fontSize: 16, maxWidth: 520 }}>{category.description_ar}</p>
      </section>

      <section className="wrap">
        {/* searchParams (sort/page) are request-time: only the grid sits behind its own boundary */}
        <Suspense fallback={<GridSkeleton />}>
          <Grid slug={slug} category={category} categories={categories} searchParams={searchParams} />
        </Suspense>
      </section>

      <OtherCategories current={category.slug} categories={categories} />
    </>
  );
}

async function Grid({
  slug,
  category,
  categories,
  searchParams,
}: {
  slug: string;
  category: Category;
  categories: Category[];
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
      <div className="bar rise d3">
        <nav aria-label="الأقسام" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {categories.map((c) => (
            <Link
              key={c.id}
              className={`chip${c.slug === slug ? " on" : ""}`}
              href={`/collections/${c.slug}`}
              aria-current={c.slug === slug ? "page" : undefined}
            >
              {c.name_ar}
            </Link>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="muted" style={{ fontSize: 14 }}>
            {total === 0 ? "مفيش منتجات" : total === 1 ? "منتج واحد" : `${total} منتجات`}
          </span>
          <SortSelect value={sort} />
        </div>
      </div>

      {total === 0 ? (
        <p className="muted" style={{ textAlign: "center", padding: "64px 0" }}>لسه مفيش منتجات في القسم ده.</p>
      ) : (
        <div className="cgrid">
          {items.map((p, i) => (
            <ProductCard key={p.slug} product={p} className="rise d3" priority={i < 3} sizes="(max-width: 900px) 50vw, 450px" />
          ))}
          {showPromo && promoTarget && (
            <Tile
              className="promo rise d4"
              href={`/products/${promoTarget.slug}`}
              src={category.image}
              alt={category.image_alt}
              position={category.image_position}
              title=""
              sizes="(max-width: 900px) 100vw, 900px"
              custom={
                <>
                  <span className="eyebrow" style={{ color: "rgba(255,255,255,.85)" }}>التخصيص</span>
                  <h2 style={{ fontSize: "clamp(28px, 3vw, 44px)", lineHeight: 1.2, maxWidth: 460 }}>
                    {category.promo_title_ar || "اطلب باسمك أو بتصميمك"}
                  </h2>
                  <span className="btn btn-w" style={{ marginTop: 6 }}>
                    ابدأ التخصيص
                    <Icon name="arrow" size={18} nudge />
                  </span>
                </>
              }
            />
          )}
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
        <div className="sh rv">
          <div>
            <span className="eyebrow">اكتشف كمان</span>
            <h2 className="h2">باقي الأقسام</h2>
          </div>
        </div>
        <div className="g2" style={{ gap: 16 }}>
          {others.map((c) => (
            <Tile
              key={c.id}
              className="rv-clip"
              href={`/collections/${c.slug}`}
              src={c.image}
              alt=""
              position={c.image_position}
              title={c.name_ar}
              sizes="(max-width: 600px) 100vw, 650px"
            />
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
