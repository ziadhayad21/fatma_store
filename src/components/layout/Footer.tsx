import Image from "next/image";
import Link from "next/link";
import { NewsletterForm } from "./NewsletterForm";
import type { NavItem } from "./nav";

export function Footer({ nav }: { nav: NavItem[] }) {
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="fgrid">
          <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "flex-start" }}>
            <Image src="/brand/logo-full.png" alt="شعار فاطمة" width={240} height={120} style={{ height: 120, width: "auto" }} />
            <p className="muted" style={{ margin: 0, fontSize: 14, maxWidth: 280 }}>
              فوط، مريلات وشنط مطبوعة — زي ما هي، أو باسمك، أو بتصميمك.
            </p>
          </div>
          <nav aria-label="تسوّق">
            <h2 className="fh">تسوّق</h2>
            {nav.map((l) => (
              <Link key={l.href} className="fl" href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>
          <nav aria-label="المساعدة">
            <h2 className="fh">المساعدة</h2>
            <a className="fl" href="#">تتبّع طلبك</a>
            <a className="fl" href="#">الشحن والاسترجاع</a>
            <a className="fl" href="#">أسئلة متكررة</a>
            <a className="fl" href="#">تواصل معانا</a>
          </nav>
          <NewsletterForm />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 64, paddingTop: 24, borderTop: "1px solid #dcd8d1", fontSize: 13, color: "#555" }}>
          <span>© 2026 فاطمة. جميع الحقوق محفوظة.</span>
          <div style={{ display: "flex", gap: 24 }}>
            <a className="fl" href="#" style={{ padding: 0 }}>Instagram</a>
            <a className="fl" href="#" style={{ padding: 0 }}>TikTok</a>
            <a className="fl" href="#" style={{ padding: 0 }}>Facebook</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
