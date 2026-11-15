import type { ProductImage } from "@/lib/types";

/** Validation helpers for the admin forms (server actions are the authority; the UI just mirrors them). */

/** Matches the product-images bucket limit. */
export const PRODUCT_IMAGE_MAX = 5 * 1024 * 1024;

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "12", "12.5", "١٢" -> number, or null when invalid. Blank -> `blank` marker. */
export function parseMoney(raw: unknown, max = 100000): number | null | "blank" {
  const s = String(raw ?? "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace("٫", ".")
    .trim();
  if (s === "") return "blank";
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= max ? n : null;
}

export const POSITION_RE = /^(center|top|bottom|left|right|\d{1,3}%)( (center|top|bottom|left|right|\d{1,3}%))?$/;

/** Allowed image sources: files shipped in /public/products, or this project's public product-images bucket. */
export function isAllowedImageSrc(src: string, supabaseOrigin: string): boolean {
  if (/^\/products\/[\w.\-]+\.(jpg|jpeg|png|webp)$/i.test(src)) return true;
  if (!supabaseOrigin) return false;
  const prefix = `${supabaseOrigin}/storage/v1/object/public/product-images/`;
  return src.startsWith(prefix) && /\.(jpg|jpeg|png|webp)$/i.test(src) && !src.includes("..");
}

export function parseImages(raw: unknown, supabaseOrigin: string): { ok: true; images: ProductImage[] } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(String(raw ?? "[]"));
  } catch {
    return { ok: false, error: "بيانات الصور غير صحيحة." };
  }
  if (!Array.isArray(data) || data.length > 8) return { ok: false, error: "الحد الأقصى 8 صور." };
  const images: ProductImage[] = [];
  for (const it of data) {
    const o = (it ?? {}) as Record<string, unknown>;
    const src = String(o.src ?? "");
    const alt = String(o.alt ?? "").trim().slice(0, 200);
    const position = String(o.position ?? "center").trim() || "center";
    if (!isAllowedImageSrc(src, supabaseOrigin)) return { ok: false, error: "في صورة مصدرها غير مسموح." };
    if (!POSITION_RE.test(position)) return { ok: false, error: `موضع الصورة غير صحيح: ${position}` };
    images.push({ src, alt, position });
  }
  return { ok: true, images };
}
