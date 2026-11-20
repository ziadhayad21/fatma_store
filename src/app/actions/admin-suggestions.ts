"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { invalidateSuggestions } from "@/lib/revalidate";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Delete a suggestion (spam, duplicates…). It disappears from the site too. */
export async function deleteSuggestion(id: string): Promise<{ ok: boolean; message: string }> {
  const { supabase } = await requireAdmin();
  if (!UUID.test(id)) return { ok: false, message: "اقتراح غير صحيح." };
  const { data, error } = await supabase.from("suggestions").delete().eq("id", id).select("id");
  if (error) {
    console.error("deleteSuggestion", error.message);
    return { ok: false, message: "الحذف ما تمش. جرّب تاني." };
  }
  if (!data?.length) return { ok: false, message: "الاقتراح مش موجود." };
  invalidateSuggestions();
  revalidatePath("/admin/suggestions");
  return { ok: true, message: "الاقتراح اتحذف." };
}
