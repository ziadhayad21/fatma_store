"use client";

import { useId, useRef, useState, useTransition } from "react";
import { deleteSuggestion } from "@/app/actions/admin-suggestions";
import { Icon } from "@/components/ui/Icon";

/** Delete button with a confirm dialog (same pattern as the catalog delete). */
export function DeleteSuggestion({ id, preview }: { id: string; preview: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const titleId = useId();
  const descId = useId();
  const short = [...preview].length > 80 ? [...preview].slice(0, 80).join("") + "…" : preview;

  function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError("");
    start(async () => {
      try {
        const res = await deleteSuggestion(id);
        if (!res.ok) setError(res.message);
        else dialog.current?.close();
      } catch {
        setError("الحذف ما تمش. جرّب تاني.");
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="adm-btn ghost sm adm-delete-btn"
        aria-label="حذف الاقتراح"
        onClick={() => {
          setError("");
          dialog.current?.showModal();
        }}
      >
        <Icon name="trash" size={15} />
        حذف
      </button>
      <dialog
        ref={dialog}
        className="adm-delete-dialog"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onCancel={(e) => {
          if (inFlight.current) e.preventDefault();
        }}
      >
        <form
          className="adm-form"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <h2 id={titleId}>حذف الاقتراح</h2>
          <p id={descId}>
            هل تريد حذف الاقتراح «<bdi>{short}</bdi>»؟ هيختفي من الموقع كمان.
          </p>
          {error && <p className="adm-err" role="alert">{error}</p>}
          <div className="adm-return-actions">
            <button type="button" className="adm-btn ghost" disabled={pending} onClick={() => dialog.current?.close()}>
              إلغاء
            </button>
            <button type="submit" className="adm-btn adm-delete-btn" disabled={pending}>
              {pending ? "جاري الحذف…" : "تأكيد الحذف"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
