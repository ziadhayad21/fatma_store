import type { Metadata } from "next";
import Image from "next/image";
import { HeroVideo } from "@/components/home/HeroVideo";
import { ProductCard } from "@/components/shop/ProductCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { TextLink } from "@/components/ui/TextLink";
import { Tile } from "@/components/ui/Tile";
import { getCategories, getProducts } from "@/lib/catalog";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const marquee = ["فوط", "مريلات", "شنط", "باسمك", "بتصميمك"];

export default async function Home() {
  const [categories, products] = await Promise.all([getCategories(), getProducts(3)]);
  const personalize = products.find((p) => p.slug === "chef-apron") ?? products[0];
  const towels = categories.find((c) => c.slug === "towels");

  return (
    <>
      <section className="hero" aria-label="الواجهة">
        <HeroVideo />
        <div className="hero-shade" />
        <div className="wrap" style={{ position: "relative", zIndex: 2, paddingBottom: 72 }}>
          <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 22 }}>
            <span className="eyebrow rise d1" style={{ color: "rgba(255,255,255,.8)" }}>مجموعة المطبخ</span>
            <h1 className="hero-h">
              <span className="ln"><span className="d2">حاجات بيتك،</span></span>
              <span className="ln"><span className="d3">بتوقيعك أنت.</span></span>
            </h1>
            <p className="rise d4" style={{ margin: 0, fontSize: 18, color: "rgba(255,255,255,.85)", maxWidth: 500 }}>
              فوط، مريلات وشنط مطبوعة — اطلبها زي ما هي، أو باسمك، أو بتصميمك.
            </p>
            <div className="rise d5" style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap", marginTop: 6 }}>
              <Button variant="w" href="#shop">تسوّق الآن</Button>
              <TextLink light href="#custom">إزاي تخصّص؟</TextLink>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" id="cats">
        <div className="wrap">
          <div className="sh rv">
            <div>
              <span className="eyebrow">الأقسام</span>
              <h2 className="h2">تسوّق حسب القسم</h2>
            </div>
          </div>
          <div className="tiles" style={{ "--cols": Math.min(categories.length, 3) } as React.CSSProperties}>
            {categories.map((c) => (
              <Tile
                key={c.id}
                className="rv-clip"
                href={`/collections/${c.slug}`}
                src={c.image}
                alt={c.image_alt}
                position={c.image_position}
                title={c.name_ar}
                sizes="(max-width: 900px) 100vw, 450px"
              />
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="shop" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sh rv">
            <div>
              <span className="eyebrow">المنتجات</span>
              <h2 className="h2">منتجاتنا</h2>
            </div>
            <TextLink href="#cats">كل الأقسام</TextLink>
          </div>
          <div className="g3" style={{ gap: 24 }}>
            {products.map((p) => (
              <ProductCard key={p.slug} product={p} className="rv" sizes="(max-width: 900px) 50vw, 450px" />
            ))}
          </div>
        </div>
      </section>

      <div className="mq" aria-hidden="true">
        <div className="mq-t">
          {[0, 1].map((k) => (
            <div className="mq-i" key={k}>
              {marquee.map((w) => (
                <span key={w} style={{ display: "contents" }}>
                  <span>{w}</span>
                  <i />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <section className="sec" id="custom">
        <div className="wrap split" style={{ gap: 80, alignItems: "center" }}>
          <div className="rv-clip" style={{ position: "relative", aspectRatio: "4/5", overflow: "hidden", background: "var(--image)" }}>
            <Image
              className="px fill-img"
              src="/products/apron-chef.jpg"
              alt="بنت لابسة مريلة مطبوع عليها Chef Fatma"
              fill
              sizes="(max-width: 900px) 100vw, 620px"
              style={{ objectPosition: "center 40%" }}
            />
            <div className="cap">
              <span style={{ fontSize: 15, fontWeight: 500 }}>Chef Fatma</span>
              <span className="muted" style={{ fontSize: 12 }}>مريلة مطبوعة بالاسم</span>
            </div>
          </div>
          <div className="rv" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div>
              <span className="eyebrow">التخصيص</span>
              <h2 className="h2">اسمك، بخطّك، على حاجتك.</h2>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 17, maxWidth: 480 }}>
              كل منتج تقدر تطلبه بـ٣ طرق — اختار اللي يناسبك.
            </p>
            <div>
              {[
                ["01", "زي ما هو", "المنتج بتصميمه الأصلي، من غير أي تعديل."],
                ["02", "باسمك", "اكتب اسم أو كلمة، واختار من خطوط عربي وإنجليزي."],
                ["03", "بتصميمك", "ارفع لوجو أو رسمة أو صورة، وإحنا نطبعها."],
              ].map(([n, t, d]) => (
                <div className="step" key={n}>
                  <b>{n}</b>
                  <div>
                    <h3 style={{ fontSize: 18 }}>{t}</h3>
                    <p className="muted" style={{ margin: "4px 0 0" }}>{d}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button href={personalize ? `/products/${personalize.slug}` : "#shop"} arrow className="self-start">
              ابدأ التخصيص
            </Button>
          </div>
        </div>
      </section>

      <section style={{ background: "var(--color-surface)", paddingBlock: "72px 80px" }}>
        <div className="wrap">
          <div className="feat">
            <div className="rv">
              <Icon name="box" size={26} />
              <h3 style={{ fontSize: 18 }}>٣ طرق للطلب</h3>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>زي ما هو، أو باسمك، أو بتصميمك.</p>
            </div>
            <div className="rv">
              <Icon name="type" size={26} />
              <h3 style={{ fontSize: 18 }}>خطوط عربي وإنجليزي</h3>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>رقعة، كوفي، نسخ وخطوط حديثة للأسماء.</p>
            </div>
            <div className="rv">
              <Icon name="upload" size={26} />
              <h3 style={{ fontSize: 18 }}>ارفع أي تصميم</h3>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>لوجو شغلك، رسمة، أو صورة بتحبها.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap split" style={{ gap: 80, alignItems: "center" }}>
          <div className="rv" style={{ display: "flex", flexDirection: "column", gap: 24, order: 2 }}>
            <div>
              <span className="eyebrow">الفوط</span>
              <h2 className="h2">كلام مصري، على قماش.</h2>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 17, maxWidth: 440 }}>
              رسومات وجُمل خفيفة من قلب البيت المصري، مطبوعة على فوط مطبخ — وتقدر تضيف عليها اسمك.
            </p>
            <TextLink href={towels ? `/collections/${towels.slug}` : "#shop"} style={{ alignSelf: "flex-start" }}>
              تسوّق الفوط
            </TextLink>
          </div>
          <div className="ed-imgs">
            <div className="rv-clip">
              <Image
                className="px fill-img"
                src="/products/towel-black.jpg"
                alt="فوطة سودا عليها رسمة وجملة ايه يابت اللي عملتي في نفسك دا"
                fill
                sizes="(max-width: 900px) 50vw, 320px"
                style={{ objectPosition: "center 40%" }}
              />
            </div>
            <div className="rv-clip">
              <Image
                className="px fill-img"
                src="/products/towel-cream.jpg"
                alt="فوطة بيج عليها رسمة وجملة تعبان مش تعبان"
                fill
                sizes="(max-width: 900px) 50vw, 320px"
                style={{ objectPosition: "center 40%" }}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
