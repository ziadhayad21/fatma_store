import Image from "next/image";
import { TextLink } from "@/components/ui/TextLink";
import { handwrittenFont } from "@/lib/fonts";
import { ABOUT_PARAGRAPH, ABOUT_RING_TEXT } from "@/lib/site-content";

export function AboutSection() {
  return (
    <section className="sec about" id="about" aria-labelledby="about-title">
      <div className="wrap about-grid">
        <div className="about-artwork">
          <span className="about-curve" aria-hidden="true" />
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
            <div className="about-disc">
              <Image src="/brand/logo-full.png" alt="شعار فاطمة" width={240} height={120} />
            </div>
          </div>
        </div>
        <div className="about-copy">
          <span className="eyebrow about-label">حكايتنا</span>
          <h2 className="about-h" id="about-title">
            <span>مش مجرد قماش…</span>
            <span>دي حاجة <em className={`about-signature ${handwrittenFont}`}>شبهك.</em></span>
          </h2>
          <p className="about-p">{ABOUT_PARAGRAPH}</p>
          <TextLink href="#categories" className="about-cta">اكتشف الأقسام</TextLink>
        </div>
      </div>
    </section>
  );
}
