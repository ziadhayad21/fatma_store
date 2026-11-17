"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { updateOrderStatus, type StatusState } from "@/app/actions/admin-orders";
import { ORDER_STATUSES, RETURN_REASON_MAX, STATUS_AR } from "@/lib/order-status";

export function StatusForm({ id, status, compact = false }: { id: string; status: string; compact?: boolean }) {
  const [state, action, pending] = useActionState<StatusState, FormData>(updateOrderStatus, { ok: false, message: "" });
  const [reason, setReason] = useState("");
  const [returnAttempted, setReturnAttempted] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const selectId = useId();
  const titleId = useId();
  const reasonId = useId();

  useEffect(() => {
    if (state.ok && state.submittedStatus === "returned") dialog.current?.close();
  }, [state]);

  function openReturnDialog() {
    setReason("");
    setReturnAttempted(false);
    dialog.current?.showModal();
  }

  return (
    <>
      <form
        action={action}
        className={`adm-status-form${compact ? " compact" : ""}`}
        onSubmit={(event) => {
          if (new FormData(event.currentTarget).get("status") === "returned") {
            event.preventDefault();
            openReturnDialog();
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <label htmlFor={selectId} className="vh">حالة الطلب</label>
        <select id={selectId} key={status} name="status" defaultValue={status} disabled={pending} onChange={(event) => {
          if (event.currentTarget.value === "returned") {
            event.currentTarget.value = status;
            openReturnDialog();
          }
        }}>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_AR[s]}</option>
          ))}
        </select>
        <button className={`adm-btn${compact ? " sm" : ""}`} type="submit" disabled={pending}>{pending ? "…" : "حفظ الحالة"}</button>
        {state.message && (state.ok || state.submittedStatus !== "returned") && (
          <span className={state.ok ? "adm-ok" : "adm-err"} role="status">{state.message}</span>
        )}
      </form>

      <dialog ref={dialog} className="adm-return-dialog" aria-labelledby={titleId} onCancel={(event) => {
        if (pending) event.preventDefault();
      }}>
        <form action={action} className="adm-form" onSubmit={() => setReturnAttempted(true)}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="returned" />
          <h2 id={titleId}>إرجاع الطلب</h2>
          <div className="adm-f">
            <label htmlFor={reasonId}>سبب الإرجاع</label>
            <textarea id={reasonId} name="return_reason" required maxLength={RETURN_REASON_MAX} value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          {returnAttempted && !state.ok && state.submittedStatus === "returned" && (
            <span className="adm-err" role="alert">{state.message}</span>
          )}
          <div className="adm-return-actions">
            <button className="adm-btn" type="submit" disabled={pending || !reason.trim()}>{pending ? "…" : "حفظ الإرجاع"}</button>
            <button className="adm-btn ghost" type="button" disabled={pending} onClick={() => dialog.current?.close()}>إلغاء</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
