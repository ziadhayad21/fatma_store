import Image from "next/image";
import { TextLink } from "@/components/ui/TextLink";
import { ABOUT_PARAGRAPH, ABOUT_RING_TEXT } from "@/lib/site-content";

/** "حكايتنا": calm two-column section (copy lives in lib/site-content.ts). */
export function AboutSection() {
  return (
    <section className="sec about" id="about" aria-labelledby="about-title">
      <span className="blob" aria-hidden="true" />
      <div className="wrap about-grid">
        <div className="about-copy rv">
          <span className="eyebrow">حكايتنا</span>
          <h2 className="h2 about-h" id="about-title">
            مش مجرد قماش…
            <br />
            دي حاجة شبهك.
          </h2>
          <p className="about-p">{ABOUT_PARAGRAPH}</p>
          <TextLink href="#categories" style={{ alignSelf: "flex-start", marginTop: 8 }}>
            اكتشف الأقسام
          </TextLink>
        </div>
        <div className="rv">
          <div className="about-badge">
            <svg className="ringtxt" viewBox="0 0 300 300" aria-hidden="true" focusable="false">
              <defs>
                <path id="about-circle" d="M150,150 m-128,0 a128,128 0 1,1 256,0 a128,128 0 1,1 -256,0" />
              </defs>
              <text>
                <textPath href="#about-circle" textLength="800" lengthAdjust="spacing">
                  {ABOUT_RING_TEXT}
                  {ABOUT_RING_TEXT}
                </textPath>
              </text>
            </svg>
            <div className="disc">
              <Image src="/brand/logo-full.png" alt="شعار فاطمة" width={240} height={120} sizes="260px" style={{ width: "62%", height: "auto" }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
