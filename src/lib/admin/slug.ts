export const CATALOG_SLUG_LIMIT = { product: 80, category: 60 } as const;
export type CatalogSlugKind = keyof typeof CATALOG_SLUG_LIMIT;

const arabic: Record<string, string> = {
  ا: "a", ب: "b", ت: "t", ث: "th", ج: "j", ح: "h", خ: "kh",
  د: "d", ذ: "dh", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s",
  ض: "d", ط: "t", ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "q",
  ك: "k", ل: "l", م: "m", ن: "n", ه: "h", و: "w", ي: "y",
  ى: "a", ة: "a", ء: "", ـ: "",
};

export function catalogSlug(name: string, kind: CatalogSlugKind): string {
  const base = name.normalize("NFKD")
    .toLowerCase()
    .replace(/\p{M}/gu, "")
    .replace(/[\u0621-\u064a]/g, (letter) => arabic[letter] ?? letter)
    .replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) % 16))
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slugWithSuffix(base || kind, kind);
}

export function slugWithSuffix(base: string, kind: CatalogSlugKind, suffix = ""): string {
  const tail = suffix ? `-${suffix}` : "";
  return base.slice(0, CATALOG_SLUG_LIMIT[kind] - tail.length).replace(/-+$/, "") + tail;
}
