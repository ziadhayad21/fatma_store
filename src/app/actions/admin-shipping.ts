"use server";

import { requireAdmin } from "@/lib/admin/auth";
import { parseMoney } from "@/lib/admin/validate";
import { governorates } from "@/lib/governorates";
import { invalidateShipping } from "@/lib/revalidate";

export type ShippingState = { ok: boolean; message: string; errors?: Record<string, string> };

/** Saves all 27 governorate fees at once. Blank = not available (checkout refuses it). */
export async function saveShipping(_prev: ShippingState, formData: FormData): Promise<ShippingState> {
  const { supabase } = await requireAdmin();
  const errors: Record<string, string> = {};
  const rows: { governorate: string; fee: number | null }[] = [];
  for (const g of governorates) {
    const v = parseMoney(formData.get(`fee:${g}`), 10000);
    if (v === null) errors[g] = "رقم غير صحيح";
    else rows.push({ governorate: g, fee: v === "blank" ? null : v });
  }
  if (Object.keys(errors).length) return { ok: false, message: "في أسعار غير صحيحة.", errors };

  const { error } = await supabase.from("shipping_rates").upsert(rows, { onConflict: "governorate" });
  if (error) return { ok: false, message: "تعذّر الحفظ." };
  invalidateShipping();
  const set = rows.filter((r) => r.fee !== null).length;
  return { ok: true, message: `اتحفظت. الشحن متاح لـ ${set} محافظة من 27.` };
}
