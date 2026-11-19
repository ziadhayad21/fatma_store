"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";

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
