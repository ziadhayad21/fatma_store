"use client";
import { useActionState } from "react";
import { confirmOrderDeposit } from "@/app/actions/admin-orders";
export function DepositReview({ id }: { id: string }) {
  const [state, action, pending] = useActionState(confirmOrderDeposit, { ok: false, message: "" });
  return <form action={action}>
    <input type="hidden" name="id" value={id} />
    <p>بعد مراجعة التحويل والتأكد من استلام مبلغ العربون، اضغط للتأكيد.</p>
    <button className="adm-btn" type="submit" disabled={pending || state.ok}>{pending ? "جاري الحفظ…" : "تأكيد استلام العربون"}</button>
    <p role="status">{state.message}</p>
  </form>;
}
