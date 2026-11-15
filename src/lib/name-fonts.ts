import type { FontId } from "./types";

/** `css` uses the CSS variables defined by the product-page layout (app/products/[slug]/layout.tsx). */
export const nameFonts: { id: FontId; label: string; css: string }[] = [
  { id: "ruqaa", label: "رقعة", css: "var(--font-ruqaa), 'Aref Ruqaa', serif" },
  { id: "kufi", label: "كوفي", css: "var(--font-kufi), 'Reem Kufi', sans-serif" },
  { id: "naskh", label: "نسخ", css: "var(--font-naskh), 'Amiri', serif" },
  { id: "bold", label: "عريض", css: "var(--font-bold), 'Lalezar', sans-serif" },
  { id: "modern", label: "حديث", css: "var(--font-readex), system-ui, sans-serif" },
];

export const fontLabel = (id: FontId | null | undefined) =>
  nameFonts.find((f) => f.id === id)?.label ?? "";

export const fontCss = (id: FontId | null | undefined) =>
  nameFonts.find((f) => f.id === id)?.css ?? nameFonts[4].css;
