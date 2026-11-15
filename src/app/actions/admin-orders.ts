"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { isOrderStatus } from "@/lib/order-status";

export type StatusState = { ok: boolean; message: string };

export async function updateOrderStatus(_prev: StatusState, formData: FormData): Promise<StatusState> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = formData.get("status");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !isOrderStatus(status)) return { ok: false, message: "بيانات غير صحيحة." };

  const { data, error } = await supabase.from("orders").update({ status }).eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, message: "تعذّر تحديث الحالة." };
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  return { ok: true, message: "اتحدّثت الحالة." };
}
