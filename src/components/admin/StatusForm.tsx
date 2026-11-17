"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { updateOrderStatus, type StatusState } from "@/app/actions/admin-orders";
import { isOrderStatus, ORDER_STATUSES, RETURN_REASON_MAX, STATUS_AR } from "@/lib/order-status";

export function StatusForm({ id, status, compact = false }: { id: string; status: string; compact?: boolean }) {
  const [state, action, pending] = useActionState<StatusState, FormData>(updateOrderStatus, { ok: false, message: "" });
  const [targetStatus, setTargetStatus] = useState<string>(status);
  const [reason, setReason] = useState("");
  const [returnAttempted, setReturnAttempted] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const titleId = useId();
  const reasonId = useId();

  // Keep select in sync with status prop from server
  useEffect(() => {
    setTargetStatus(status);
    if (selectRef.current) {
      selectRef.current.value = status;
    }
  }, [status]);

  // Close dialog on successful update
  useEffect(() => {
    if (state.ok) {
      dialogRef.current?.close();
      setReason("");
      setReturnAttempted(false);
    }
  }, [state]);

  function handleSelectChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.currentTarget.value;
    if (next === status) return;

    setTargetStatus(next);
    setReason("");
    setReturnAttempted(false);
    dialogRef.current?.showModal();
  }

  function handleCancel() {
    setTargetStatus(status);
    if (selectRef.current) {
      selectRef.current.value = status;
    }
    dialogRef.current?.close();
  }

  const isReturn = targetStatus === "returned";
  const currentLabel = isOrderStatus(status) ? STATUS_AR[status] : status;
  const targetLabel = isOrderStatus(targetStatus) ? STATUS_AR[targetStatus] : targetStatus;

  return (
    <>
      <div className={`adm-status-control${compact ? " compact" : ""}`}>
        <select
          ref={selectRef}
          key={status}
          defaultValue={status}
          data-s={status}
          disabled={pending}
          onChange={handleSelectChange}
          className="adm-status-select"
          aria-label="تغيير حالة الطلب"
        >
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_AR[s]}
            </option>
          ))}
        </select>
        {pending && <span className="adm-status-spinner" aria-hidden="true" title="جاري التحديث…" />}
      </div>

      <dialog
        ref={dialogRef}
        className="adm-status-dialog"
        aria-labelledby={titleId}
        onCancel={(event) => {
          if (pending) {
            event.preventDefault();
          } else {
            handleCancel();
          }
        }}
        onClick={(event) => {
          // Close when clicking the backdrop
          if (event.target === dialogRef.current && !pending) {
            handleCancel();
          }
        }}
      >
        <form
          action={action}
          className="adm-dialog-form"
          onSubmit={() => {
            if (isReturn) setReturnAttempted(true);
          }}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={targetStatus} />

          <div className="adm-dialog-header">
            <h2 id={titleId} className="adm-dialog-title">
              {isReturn ? "تأكيد إرجاع الطلب" : "تأكيد تغيير حالة الطلب"}
            </h2>
            <p className="adm-dialog-desc">
              {isReturn
                ? "هل أنت متأكد من تغيير حالة هذا الطلب إلى «رجّع»؟ يرجى كتابة سبب الإرجاع."
                : `هل أنت متأكد من تغيير حالة الطلب من «${currentLabel}» إلى «${targetLabel}»؟`}
            </p>
          </div>

          {isReturn && (
            <div className="adm-f">
              <label htmlFor={reasonId}>
                سبب الإرجاع <span className="req">*</span>
              </label>
              <textarea
                id={reasonId}
                name="return_reason"
                required
                maxLength={RETURN_REASON_MAX}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="اكتب سبب إرجاع العميل للطلب..."
                rows={3}
                autoFocus
              />
            </div>
          )}

          {returnAttempted && !state.ok && state.submittedStatus === "returned" && (
            <span className="adm-err" role="alert">{state.message}</span>
          )}

          {!isReturn && !state.ok && state.message && (
            <span className="adm-err" role="alert">{state.message}</span>
          )}

          <div className="adm-dialog-actions">
            <button
              className="adm-btn adm-confirm-btn"
              type="submit"
              disabled={pending || (isReturn && !reason.trim())}
            >
              {pending ? "جاري الحفظ…" : isReturn ? "تأكيد الإرجاع" : "تأكيد التغيير"}
            </button>
            <button
              className="adm-btn ghost"
              type="button"
              disabled={pending}
              onClick={handleCancel}
            >
              إلغاء
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
