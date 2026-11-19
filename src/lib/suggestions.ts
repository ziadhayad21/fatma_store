/** Rules for customer suggestions, shared by the popup (UX) and the server action (authority). */
export const SUGGESTION_MAX = 500;

export type SuggestionCheck = { ok: true; text: string } | { ok: false; error: string };

export function cleanSuggestion(raw: unknown): SuggestionCheck {
  // NFC, no control characters (keep line breaks), trimmed
  const text = String(raw ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length === 0) return { ok: false, error: "اكتب اقتراحك الأول." };
  if ([...text].length > SUGGESTION_MAX) return { ok: false, error: `الاقتراح أطول من ${SUGGESTION_MAX} حرف.` };
  return { ok: true, text };
}
