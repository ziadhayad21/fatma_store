"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/ui/Icon";
import { useCart } from "@/store/cart";
import { useUI } from "@/store/ui";
import { NavLinks, NavLinksStatic } from "./NavLinks";
import type { NavItem } from "./nav";

export function Header({ nav }: { nav: NavItem[] }) {
  const count = useCart((s) => s.lines.reduce((a, l) => a + l.qty, 0));
  const openCart = useUI((s) => s.openCart);
  const openMenu = useUI((s) => s.openMenu);
  const menuOpen = useUI((s) => s.menuOpen);

  return (
    <header className="hdr">
      <div className="wrap hdr-in">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" className="ib burger" aria-label="فتح القائمة" aria-expanded={menuOpen} onClick={openMenu}>
            <Icon name="menu" size={22} />
          </button>
          <nav className="nav" aria-label="القائمة الرئيسية">
            <Suspense fallback={<NavLinksStatic nav={nav} />}>
              <NavLinks nav={nav} />
            </Suspense>
          </nav>
        </div>
        <Link className="logo" href="/" aria-label="فاطمة — الصفحة الرئيسية">
          <Image src="/brand/logo-mark.png" alt="" width={54} height={54} priority style={{ width: "auto" }} />
          <span>فاطمة</span>
        </Link>
        <div className="tools">
          <button type="button" className="ib hide-m" aria-label="بحث">
            <Icon name="search" size={21} />
          </button>
          {/* Always /admin/login: the login page itself sends a signed-in admin on to /admin, so the header
              stays fully static (no session read) and the catalog cache is untouched. */}
          <Link className="ib hide-m" href="/admin/login" prefetch={false} aria-label="حسابي">
            <Icon name="user" size={21} />
          </Link>
          <button
            type="button"
            className="ib"
            aria-label={count > 0 ? `فتح السلة، ${count} منتج` : "فتح السلة"}
            onClick={openCart}
          >
            <Icon name="bag" size={21} />
            {count > 0 && (
              <span className="badge" key={count} aria-hidden="true">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
