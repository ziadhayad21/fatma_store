import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { diyKind } from "@/components/shop/DiyIllustration";
import { ProductGallery } from "@/components/shop/ProductGallery";
import { ProductPurchase } from "@/components/shop/ProductPurchase";
import { ProductCard } from "@/components/shop/ProductCard";
import { Icon } from "@/components/ui/Icon";
import { getProduct, getRelatedProducts } from "@/lib/catalog";
import { publicEnv } from "@/lib/env";
import { fromPrice } from "@/lib/pricing/discount";

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProduct(slug);
  if (!p) return {};
  return {
    title: p.name_ar,
    description: p.description_ar,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: { title: `${p.name_ar} | فاطمة`, description: p.description_ar, images: p.images.slice(0, 1).map((i) => i.src) },
  };
}

export default function ProductPage(props: PageProps<"/products/[slug]">) {
  return (
    <Suspense fallback={<div className="wrap" style={{ minHeight: 800 }} aria-busy="true" />}>
      <ProductContent {...props} />
    </Suspense>
  );
}

async function ProductContent({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();
  const related = await getRelatedProducts(slug, 4);

  const abs = (u: string) => (u.startsWith("http") ? u : `${publicEnv.siteUrl}${u}`);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name_ar,
    description: product.description_ar,
    image: product.images.map((i) => abs(i.src)),
    category: product.category_name,
    brand: { "@type": "Brand", name: "فاطمة" },
    url: `${publicEnv.siteUrl}/products/${product.slug}`,
    offers: {
      "@type": "Offer",
      priceCurrency: "EGP",
      price: fromPrice(product).price,
      availability: "https://schema.org/InStock",
      url: `${publicEnv.siteUrl}/products/${product.slug}`,
    },
  };

  return (
    <div className="wrap" style={{ paddingBottom: 0 }}>
      <script
        type="application/ld+json"
        // "<" escaped so a product name can never close the script tag
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <nav className="crumb crumb-pad" aria-label="مسار الصفحة">
        <Link href="/">الرئيسية</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/collections/${product.category_slug}`}>{product.category_name}</Link>
        <span aria-hidden="true">/</span>
        <span style={{ color: "var(--ink)" }}>{product.name_ar}</span>
      </nav>
      <div className="pdp">
        <ProductGallery images={product.images} diy={product.is_diy ? diyKind(product.category_slug) : null} />
        <ProductPurchase product={product} />
      </div>

      {related.length > 0 && (
        <section className="sec related">
          <div className="sh rv">
            <div>
              <span className="eyebrow">اكتشف كمان</span>
              <h2 className="h2">ممكن يعجبك كمان</h2>
            </div>
            <Link
              href={`/collections/${product.category_slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#141414] transition-colors hover:text-[#c1121f]"
            >
              <span>كل منتجات {product.category_name}</span>
              <Icon name="arrow" size={16} nudge />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-8">
            {related.map((p, i) => (
              <ProductCard
                key={p.slug}
                product={p}
                variant="listing"
                priority={i < 2}
                sizes="(min-width: 1192px) 280px, (min-width: 1024px) calc(25vw - 18px), (min-width: 640px) calc(50vw - 22px), calc(50vw - 18px)"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
