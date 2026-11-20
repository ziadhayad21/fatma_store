"use server";

import { source } from "@/lib/data/source";
import { allow, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { invalidateSuggestions } from "@/lib/revalidate";
import { cleanSuggestion, SUGGESTIONS_PAGE } from "@/lib/suggestions";
import { backendConfigured, createServiceClient } from "@/lib/supabase/admin";
import type { PublicSuggestion } from "@/lib/types";

export type SuggestionResult = { ok: true; suggestion: PublicSuggestion } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The only way a suggestion is written (the table has no insert grant for anon/authenticated).
 * It shows on the site right away. Optional for the customer; a failure here never affects their order.
 */
export async function submitSuggestion(input: { text: unknown; orderId?: unknown }): Promise<SuggestionResult> {
  const checked = cleanSuggestion(input?.text);
  if (!checked.ok) return checked;
  if (!backendConfigured()) return { ok: false, error: "الاقتراحات مش متاحة دلوقتي." };
  if (!(await allow("suggestion"))) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const orderId = typeof input?.orderId === "string" && UUID.test(input.orderId) ? input.orderId : null;
  const sb = createServiceClient();
  const insert = (order_id: string | null) =>
    sb.from("suggestions").insert({ text: checked.text, order_id, is_public: true }).select("text, created_at").single();
  let { data, error } = await insert(orderId);
  // an unknown order id (23503) must not lose the suggestion: keep it without the link
  if (error?.code === "23503") ({ data, error } = await insert(null));
  if (error || !data) {
    console.error("submitSuggestion failed", error?.message);
    return { ok: false, error: "حصلت مشكلة. جرّب تاني بعد شوية." };
  }
  invalidateSuggestions();
  return { ok: true, suggestion: { text: data.text as string, created_at: data.created_at as string } };
}

/** "عرض المزيد": the next page of suggestions older than `before`. */
export async function loadMoreSuggestions(before: unknown): Promise<{ items: PublicSuggestion[]; hasMore: boolean }> {
  if (typeof before !== "string" || before.length > 40 || !Number.isFinite(Date.parse(before))) return { items: [], hasMore: false };
  const rows = await source.publicSuggestions({ limit: SUGGESTIONS_PAGE + 1, before });
  return { items: rows.slice(0, SUGGESTIONS_PAGE), hasMore: rows.length > SUGGESTIONS_PAGE };
}
