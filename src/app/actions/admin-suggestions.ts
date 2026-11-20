"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { invalidateSuggestions } from "@/lib/revalidate";
import { cleanReply, isSuggestionStatus } from "@/lib/suggestions";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// the unread badge lives in the admin sidebar (layout), so refresh the whole admin
const refresh = () => revalidatePath("/admin", "layout");

export async function markSuggestionRead(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  const { error } = await supabase.from("suggestions").update({ is_read: true }).eq("id", id);
  if (error) console.error("markSuggestionRead", error.message);
  refresh();
}

export async function markAllSuggestionsRead(): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("suggestions").update({ is_read: true }).eq("is_read", false);
  if (error) console.error("markAllSuggestionsRead", error.message);
  refresh();
}

export type ModerateState = { ok: boolean; message: string };

/** Show on the site / status / short public reply. Saving also marks the suggestion as read. */
export async function moderateSuggestion(_prev: ModerateState, formData: FormData): Promise<ModerateState> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { ok: false, message: "اقتراح غير صحيح." };
  const status = String(formData.get("status") ?? "");
  if (!isSuggestionStatus(status)) return { ok: false, message: "اختار الحالة." };
  const reply = cleanReply(formData.get("admin_reply"));
  if (!reply.ok) return { ok: false, message: reply.error };

  const { error } = await supabase
    .from("suggestions")
    .update({ is_public: formData.get("is_public") === "on", status, admin_reply: reply.text, is_read: true })
    .eq("id", id);
  if (error) {
    console.error("moderateSuggestion", error.message);
    return { ok: false, message: "تعذّر الحفظ. جرّب تاني." };
  }
  invalidateSuggestions();
  refresh();
  return { ok: true, message: "اتحفظ." };
}
