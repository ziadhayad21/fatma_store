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

export const SUGGESTION_STATUSES = ["new", "reviewing", "done"] as const;
export const isSuggestionStatus = (v: unknown): v is (typeof SUGGESTION_STATUSES)[number] =>
  typeof v === "string" && (SUGGESTION_STATUSES as readonly string[]).includes(v);

/** Admin labels (جديد / تحت الدراسة / اتنفّذ). */
export const SUGGESTION_STATUS_LABEL = { new: "جديد", reviewing: "تحت الدراسة", done: "اتنفّذ" } as const;

/** The admin's short public reply (optional). Matches the column check (1–300 characters, or null). */
export const REPLY_MAX = 300;
export function cleanReply(raw: unknown): { ok: true; text: string | null } | { ok: false; error: string } {
  const text = String(raw ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!text) return { ok: true, text: null };
  if ([...text].length > REPLY_MAX) return { ok: false, error: `الرد أطول من ${REPLY_MAX} حرف.` };
  return { ok: true, text };
}
