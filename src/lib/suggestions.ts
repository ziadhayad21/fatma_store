/** Rules for customer suggestions, shared by the forms (UX) and the server action (authority). */
export const SUGGESTION_MIN = 3;
export const SUGGESTION_MAX = 500;
/** suggestions per page on the home page */
export const SUGGESTIONS_PAGE = 6;

export type SuggestionCheck = { ok: true; text: string } | { ok: false; error: string };

/** Arabic-Indic / Persian digits → 0-9, so "٠١٠…" is caught like "010…". */
const latinDigits = (s: string) => s.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) % 16));

// http(s)://, www., or a domain-looking word (example.com, bit.ly, wa.me, t.me …)
const LINK = /(?:https?:\/\/|www\.|\b[a-z0-9-]+\s?\.\s?(?:com|net|org|info|biz|io|co|me|ly|eg|app|site|online|store|shop|xyz|link|page|gl|to|tv|ai)\b)/i;
// 8+ digits, optionally separated by spaces / dashes / dots / brackets, optional leading +
const PHONE = /\+?\d(?:[\s\-.()]*\d){7,}/;

export function cleanSuggestion(raw: unknown): SuggestionCheck {
  // NFC, no control characters (keep line breaks), trimmed
  const text = String(raw ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const length = [...text].length;
  if (length === 0) return { ok: false, error: "اكتب اقتراحك الأول." };
  if (length < SUGGESTION_MIN) return { ok: false, error: `الاقتراح قصير أوي، اكتب ${SUGGESTION_MIN} حروف على الأقل.` };
  if (length > SUGGESTION_MAX) return { ok: false, error: `الاقتراح أطول من ${SUGGESTION_MAX} حرف.` };
  if (LINK.test(text)) return { ok: false, error: "من فضلك اكتب اقتراحك من غير لينكات." };
  if (PHONE.test(latinDigits(text))) return { ok: false, error: "من فضلك اكتب اقتراحك من غير أرقام تليفونات." };
  return { ok: true, text };
}

