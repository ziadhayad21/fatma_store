"use client";

import Image from "next/image";
import Link from "next/link";
import { Drawer } from "@/components/ui/Drawer";
import { Icon } from "@/components/ui/Icon";
import { useUI } from "@/store/ui";
import type { NavItem } from "./nav";

export function MobileMenu({ nav }: { nav: NavItem[] }) {
  const open = useUI((s) => s.menuOpen);
  const closeAll = useUI((s) => s.closeAll);
  return (
    <Drawer open={open} onClose={closeAll} side="right" label="قائمة الموبايل">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span className="logo">
          <Image src="/brand/logo-mark.png" alt="" width={40} height={40} style={{ height: 40, width: "auto" }} />
          <span style={{ fontSize: 20 }}>فاطمة</span>
        </span>
        <button type="button" className="ib" aria-label="إغلاق القائمة" onClick={closeAll}>
          <Icon name="close" size={20} />
        </button>
      </div>
      <nav aria-label="روابط الموبايل">
        {nav.map((l) => (
          <Link key={l.href} className="mm-l" href={l.href} onClick={closeAll}>
            {l.label}
            <Icon name="arrow" size={18} />
          </Link>
        ))}
      </nav>
      <Link className="mm-acct" href="/admin/login" prefetch={false} onClick={closeAll}>
        <Icon name="user" size={20} />
        تسجيل الدخول
      </Link>
    </Drawer>
  );
}
