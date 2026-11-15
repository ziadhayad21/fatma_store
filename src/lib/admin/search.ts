import { normalizePhone } from "@/lib/checkout";

/**
 * Builds the PostgREST `or=(...)` filter for the admin order search box.
 * Matches order number ("1005" / "#1005"), phone (any part, Arabic digits ok) and customer name.
 * User text is stripped of characters that have meaning inside a PostgREST filter, so it cannot
 * inject extra conditions.
 */
export function orderSearchFilter(raw: string): string | null {
  const text = raw.normalize("NFC").replace(/[%,()"'\*:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!text) return null;
  const clauses: string[] = [];
  const digits = normalizePhone(text).replace(/^#/, "").replace(/\D/g, "");
  if (/^#?\d{3,6}$/.test(text.replace(/\s/g, "")) && digits.length <= 6) clauses.push(`number.eq.${Number(digits)}`);
  if (digits.length >= 3) clauses.push(`phone.ilike.%${digits}%`);
  clauses.push(`customer_name.ilike.%${text}%`);
  return clauses.join(",");
}
