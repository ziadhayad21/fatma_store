import type { Category } from "@/lib/types";

export type NavItem = { href: string; label: string };

/** Navigation is generated from the categories table, plus the fixed "حكايتنا" anchor (About section on the home page). */
export function buildNav(categories: Pick<Category, "slug" | "name_ar">[]): NavItem[] {
  return [
    ...categories.map((c) => ({ href: `/collections/${c.slug}`, label: c.name_ar })),
    { href: "/#about", label: "حكايتنا" },
  ];
}
