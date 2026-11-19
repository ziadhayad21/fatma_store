"use server";

import { allow, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { cleanSuggestion } from "@/lib/suggestions";
import { backendConfigured, createServiceClient } from "@/lib/supabase/admin";

export type SuggestionResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The only way a suggestion is written (the table has no insert grant for anon/authenticated).
 * Optional for the customer; a failure here never affects their order.
 */
export async function submitSuggestion(input: { text: unknown; orderId?: unknown }): Promise<SuggestionResult> {
  const checked = cleanSuggestion(input?.text);
  if (!checked.ok) return checked;
  if (!backendConfigured()) return { ok: false, error: "الاقتراحات مش متاحة دلوقتي." };
  if (!(await allow("suggestion"))) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const orderId = typeof input?.orderId === "string" && UUID.test(input.orderId) ? input.orderId : null;
  const sb = createServiceClient();
  let { error } = await sb.from("suggestions").insert({ text: checked.text, order_id: orderId });
  // an unknown order id (23503) must not lose the suggestion: keep it without the link
  if (error?.code === "23503") ({ error } = await sb.from("suggestions").insert({ text: checked.text, order_id: null }));
  if (error) {
    console.error("submitSuggestion failed", error.message);
    return { ok: false, error: "حصلت مشكلة. جرّب تاني بعد شوية." };
  }
  return { ok: true };
}
