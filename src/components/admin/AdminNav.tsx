"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "الرئيسية", exact: true },
  { href: "/admin/orders", label: "الطلبات" },
  { href: "/admin/products", label: "المنتجات" },
  { href: "/admin/categories", label: "الأقسام" },
  { href: "/admin/shipping", label: "الشحن" },
  { href: "/admin/subscribers", label: "المشتركين" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="لوحة التحكم" className="adm-nav">
      {items.map((i) => {
        const on = i.exact ? path === i.href : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={on ? "on" : ""}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
