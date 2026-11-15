import { nameFonts } from "./name-fonts";
import type { FontId } from "./types";

/** Rules shared by the product page (UX) and the server (authority). */
export const NAME_MAX = 18;
export const DESIGN_MAX_BYTES = 10 * 1024 * 1024;
export const DESIGN_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const DESIGN_ACCEPT = DESIGN_TYPES.join(",");

export const DESIGN_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Unicode letters (Arabic + Latin), digits, spaces and a few separators. No control chars / markup. */
const NAME_RE = /^[\p{L}\p{M}\p{N} .'\-&_]+$/u;

export type Check = { ok: true } | { ok: false; error: string };

export function normalizeName(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function validateName(raw: string): Check {
  const name = normalizeName(raw);
  if (name.length === 0) return { ok: false, error: "اكتب الاسم الأول." };
  if ([...name].length > NAME_MAX) return { ok: false, error: `الاسم أطول من ${NAME_MAX} حرف.` };
  if (!NAME_RE.test(name)) return { ok: false, error: "استخدم حروف أو أرقام بس." };
  return { ok: true };
}

export function isFontId(v: unknown): v is FontId {
  return typeof v === "string" && nameFonts.some((f) => f.id === v);
}

export function validateDesignFile(file: { type: string; size: number }): Check {
  if (!(DESIGN_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: "الملف لازم يكون صورة PNG أو JPG أو WEBP." };
  }
  if (file.size <= 0) return { ok: false, error: "الملف فاضي." };
  if (file.size > DESIGN_MAX_BYTES) return { ok: false, error: "حجم الملف أكبر من 10 ميجا." };
  return { ok: true };
}

/** Storage keys issued by the server: uploads/<yyyy-mm>/<uuid>.<ext>  (the only shape the server accepts). */
export const DESIGN_PATH_RE =
  /^uploads\/\d{4}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$/;

export const isDesignPath = (v: unknown): v is string => typeof v === "string" && DESIGN_PATH_RE.test(v);
