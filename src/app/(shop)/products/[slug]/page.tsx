import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductGallery } from "@/components/shop/ProductGallery";
import { ProductPurchase } from "@/components/shop/ProductPurchase";
import { ProductCard } from "@/components/shop/ProductCard";
import { Icon } from "@/components/ui/Icon";
import { getProduct, getRelatedProducts } from "@/lib/catalog";
import { publicEnv } from "@/lib/env";

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
  const related = await getRelatedProducts(slug, 2);

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
      price: product.base_price,
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
        <ProductGallery images={product.images} />
        <ProductPurchase product={product} />
      </div>

      <section className="sec related">
        <div className="sh rv">
          <div>
            <span className="eyebrow">اكتشف كمان</span>
            <h2 className="h2">ممكن يعجبك كمان</h2>
          </div>
        </div>
        <div className="g3" style={{ gap: 24 }}>
          {related.map((p) => (
            <ProductCard key={p.slug} product={p} className="rv" sizes="(max-width: 900px) 50vw, 450px" />
          ))}
          <Link className="more rv" href="/#categories">
            <span className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>فاطمة</span>
            <span style={{ fontSize: 30, lineHeight: 1.25, fontWeight: 500 }}>شوف كل الأقسام</span>
            <Icon name="arrow" size={18} nudge />
          </Link>
        </div>
      </section>
    </div>
  );
}
