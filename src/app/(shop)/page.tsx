import type { Metadata } from "next";
import { AboutSection } from "@/components/home/AboutSection";
import { HeroVideo } from "@/components/home/HeroVideo";
import { Marquee } from "@/components/home/Marquee";
import { ReviewsSection } from "@/components/home/ReviewsSection";
import { VideoReelsSection } from "@/components/home/VideoReelsSection";
import { Button } from "@/components/ui/Button";
import { Doodle } from "@/components/ui/Doodle";
import { TextLink } from "@/components/ui/TextLink";
import { Tile } from "@/components/ui/Tile";
import { getCategories, getReviews } from "@/lib/catalog";

export const metadata: Metadata = { alternates: { canonical: "/" } };

// dev-only instant-navigation validation opt-out (see (shop)/layout.tsx)
export const instant = false;

/** Section order: hero, categories, marquee band, reviews, about, footer. */
export default async function Home() {
  const [categories, reviews] = await Promise.all([getCategories(), getReviews()]);

  return (
    <>
      <section className="hero" aria-label="الواجهة">
        <HeroVideo />
        <div className="hero-shade" />
        <div className="wrap hero-wrap">
          <div className="hero-copy">
            <span className="hero-eyebrow">مجموعة المطبخ</span>
            <h1 className="hero-h">
              <span className="ln"><span className="d2">حاجات بيتك،</span></span>
              <span className="ln ln-sig">
                <span className="d3">
                  <span className="sig">
                    بتوقيعك
                    {/* hand-drawn pen stroke, starting at the right (RTL); pathLength=1 lets CSS draw it with stroke-dashoffset */}
                    <svg className="sig-line" viewBox="0 0 200 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                      <path d="M197 15 C 174 6, 142 19, 104 11 S 40 5, 3 13" pathLength="1" />
                    </svg>
                  </span>{" "}
                  أنت.
                </span>
              </span>
            </h1>
            <p className="hero-p">فوط، مريلات وشنط مطبوعة — اطلبها زي ما هي، أو باسمك، أو بتصميمك.</p>
            <div className="hero-cta">
              <Button variant="w" href="#categories">تسوّق الآن</Button>
              <TextLink light href="#about">حكايتنا</TextLink>
            </div>
          </div>
        </div>
      </section>

      <section className="sec dept-sec" id="categories">
        <div className="wrap">
          <div className="sh dept-head rv">
            <div>
              <span className="eyebrow">Departments</span>
              <h2 className="h2">
                Shop by{" "}
                <span className="mark">
                  Department
                  <Doodle kind="underline" className="dl-underline" />
                </span>
              </h2>
            </div>
          </div>
          <div className="tiles dept-grid">
            {categories.map((c) => (
              <Tile
                key={c.id}
                className="dept-card"
                href={`/collections/${c.slug}`}
                src={c.image}
                alt={c.image_alt}
                position={c.image_position}
                title={c.name_ar}
                accent={c.accent_color}
                sizes="(max-width: 900px) 100vw, 450px"
                custom={
                  <>
                    <span className="dept-shop">← Shop</span>
                    <h3 className="dept-title">{c.name_ar}</h3>
                  </>
                }
              />
            ))}
          </div>
        </div>
      </section>

      <Marquee />

      <VideoReelsSection />

      <ReviewsSection reviews={reviews} />

      <AboutSection />
    </>
  );
}
