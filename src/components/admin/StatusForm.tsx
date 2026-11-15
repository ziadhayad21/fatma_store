"use client";

import { useActionState } from "react";
import { updateOrderStatus, type StatusState } from "@/app/actions/admin-orders";
import { ORDER_STATUSES, STATUS_AR } from "@/lib/order-status";

export function StatusForm({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState<StatusState, FormData>(updateOrderStatus, { ok: false, message: "" });
  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="id" value={id} />
      <label htmlFor="status" className="vh">حالة الطلب</label>
      <select id="status" name="status" defaultValue={status}>
        {ORDER_STATUSES.map((s) => (
          <option key={s} value={s}>{STATUS_AR[s]}</option>
        ))}
      </select>
      <button className="adm-btn" type="submit" disabled={pending}>{pending ? "…" : "حفظ الحالة"}</button>
      {state.message && (
        <span className={state.ok ? "adm-ok" : "adm-err"} role="status">{state.message}</span>
      )}
    </form>
  );
}
