"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./nav";

/** Reads the pathname for aria-current. Render inside <Suspense fallback={<NavLinksStatic/>}> — URL data is request-time. */
export function NavLinks({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname();
  return (
    <>
      {nav.map((l) => (
        <Link key={l.href} className="nl" href={l.href} aria-current={pathname === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </>
  );
}

export function NavLinksStatic({ nav }: { nav: NavItem[] }) {
  return (
    <>
      {nav.map((l) => (
        <Link key={l.href} className="nl" href={l.href}>
          {l.label}
        </Link>
      ))}
    </>
  );
}
