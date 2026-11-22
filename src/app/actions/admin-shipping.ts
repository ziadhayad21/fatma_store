"use server";

import { requireAdmin } from "@/lib/admin/auth";
import { parseMoney } from "@/lib/admin/validate";
import { governorates } from "@/lib/governorates";
import { invalidateShipping } from "@/lib/revalidate";

export type ShippingState = { ok: boolean; message: string; errors?: Record<string, string> };

export type PlaceActionState = { ok: boolean; message: string; error?: string };

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

export async function addShippingPlace(_prev: PlaceActionState, formData: FormData): Promise<PlaceActionState> {
  const { supabase } = await requireAdmin();
  const governorate = String(formData.get("governorate") ?? "").trim();
  const name = String(formData.get("name") ?? "").normalize("NFC").trim();
  const rawFee = formData.get("fee");
  const fee = parseMoney(rawFee, 10000);

  if (!(governorates as readonly string[]).includes(governorate)) return { ok: false, message: "المحافظة غير صحيحة." };
  if (!name || name.length > 120) return { ok: false, message: "اكتب اسم المكان / المنطقة (حتى 120 حرف)." };
  if (fee === null || fee === "blank") return { ok: false, message: "اكتب سعر الشحن الصحيح للمكان." };

  const { error } = await supabase.from("shipping_places").insert({
    governorate,
    name,
    fee,
  });

  if (error) {
    if (error.code === "23505") return { ok: false, message: "المكان ده مضاف بالفعل لنفس المحافظة." };
    return { ok: false, message: "تعذّر إضافة المكان. جرّب تاني." };
  }

  invalidateShipping();
  return { ok: true, message: `تمت إضافة «${name}» لمحافظة ${governorate}.` };
}

export async function updateShippingPlace(_prev: PlaceActionState, formData: FormData): Promise<PlaceActionState> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").normalize("NFC").trim();
  const fee = parseMoney(formData.get("fee"), 10000);

  if (!id) return { ok: false, message: "مكان غير صحيح." };
  if (!name || name.length > 120) return { ok: false, message: "اكتب اسم المكان / المنطقة (حتى 120 حرف)." };
  if (fee === null || fee === "blank") return { ok: false, message: "اكتب سعر الشحن الصحيح للمكان." };

  const { error } = await supabase.from("shipping_places").update({
    name,
    fee,
  }).eq("id", id);

  if (error) {
    if (error.code === "23505") return { ok: false, message: "اسم المكان موجود بالفعل في نفس المحافظة." };
    return { ok: false, message: "تعذّر تعديل المكان. جرّب تاني." };
  }

  invalidateShipping();
  return { ok: true, message: `تم تعديل المكان «${name}».` };
}

export async function deleteShippingPlace(_prev: PlaceActionState, formData: FormData): Promise<PlaceActionState> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "مكان غير صحيح." };

  const { error } = await supabase.from("shipping_places").delete().eq("id", id);
  if (error) return { ok: false, message: "تعذّر حذف المكان." };

  invalidateShipping();
  return { ok: true, message: "تم حذف المكان بنجاح." };
}
