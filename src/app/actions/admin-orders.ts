"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { isOrderStatus, RETURN_REASON_MAX } from "@/lib/order-status";

export type StatusState = { ok: boolean; message: string; submittedStatus?: string };

export async function updateOrderStatus(_prev: StatusState, formData: FormData): Promise<StatusState> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = formData.get("status");
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) || !isOrderStatus(status)) {
    return { ok: false, message: "بيانات غير صحيحة." };
  }

  const rawReason = formData.get("return_reason");
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (status === "returned" && (!reason || reason.length > RETURN_REASON_MAX)) {
    return { ok: false, message: "اكتب سبب الإرجاع (حتى ١٠٠٠ حرف).", submittedStatus: status };
  }

  if (["prepared", "shipped", "delivered", "returned"].includes(status)) {
    const { data: order } = await supabase.from("orders").select("deposit_status").eq("id", id).maybeSingle();
    if (order?.deposit_status && order.deposit_status !== "confirmed") return { ok: false, message: "لازم تراجع وتؤكد العربون من تفاصيل الطلب الأول.", submittedStatus: status };
  }
  const update = { status, return_reason: status === "returned" ? reason : null };
  const { data, error } = await supabase.from("orders").update(update).eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, message: "تعذّر تحديث الحالة.", submittedStatus: status };
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath(`/order/${id}`);
  return { ok: true, message: "اتحدّثت الحالة.", submittedStatus: status };
}

export async function confirmOrderDeposit(_prev: StatusState, formData: FormData): Promise<StatusState> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return { ok: false, message: "بيانات غير صحيحة." };
  const { data, error } = await supabase.from("orders").update({ deposit_status: "confirmed" }).eq("id", id).eq("deposit_status", "submitted").not("payment_proof_path", "is", null).select("id");
  if (error || !data?.length) return { ok: false, message: "تعذّر تأكيد العربون. راجع إثبات التحويل وحالة الطلب." };
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath(`/order/${id}`);
  return { ok: true, message: "تم تأكيد العربون بعد المراجعة." };
}
