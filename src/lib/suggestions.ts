/** Rules for customer suggestions, shared by the forms (UX) and the server action (authority). */
export const SUGGESTION_MIN = 3;
export const SUGGESTION_MAX = 500;
/** suggestions per page on the home page */
export const SUGGESTIONS_PAGE = 9;

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

/** "دلوقتي", "من 5 دقايق", "من ساعتين", "من يومين", "من 3 شهور" … (Egyptian Arabic). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const minutes = Math.max(0, Math.floor((now - t) / 60_000));
  // one, two (dual), 3–10 (plural), 11+ (singular)
  const say = (n: number, one: string, two: string, few: string, many: string) =>
    n === 1 ? `من ${one}` : n === 2 ? `من ${two}` : `من ${n} ${n <= 10 ? few : many}`;
  if (minutes < 1) return "دلوقتي";
  if (minutes < 60) return say(minutes, "دقيقة", "دقيقتين", "دقايق", "دقيقة");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return say(hours, "ساعة", "ساعتين", "ساعات", "ساعة");
  const days = Math.floor(hours / 24);
  if (days < 30) return say(days, "يوم", "يومين", "أيام", "يوم");
  const months = Math.floor(days / 30);
  if (months < 12) return say(months, "شهر", "شهرين", "شهور", "شهر");
  const years = Math.floor(days / 365);
  return say(Math.max(1, years), "سنة", "سنتين", "سنين", "سنة");
}
