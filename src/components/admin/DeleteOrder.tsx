"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { deleteOrders } from "@/app/actions/admin-storage";
import { Icon } from "@/components/ui/Icon";

/** Danger area on the order page: deleting needs the order number typed in the dialog. */
export function DeleteOrder({ id, number }: { id: string; number: number | string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const uid = useId();
  const match = typed.trim().replace(/^#/, "") === String(number);

  function confirm() {
    if (!match || pending) return;
    setError("");
    start(async () => {
      const res = await deleteOrders([id]).catch(() => null);
      if (!res?.ok) {
        setError(res?.message ?? "تعذّر حذف الطلب. جرّب تاني.");
        return;
      }
      dialog.current?.close();
      router.push(`/admin/orders?deleted=${res.deleted}`);
    });
  }

  return (
    <section className="adm-card adm-danger" aria-labelledby={`${uid}-h`}>
      <div>
        <h2 id={`${uid}-h`}>حذف الطلب</h2>
        <p className="adm-hint">الطلب ومنتجاته وملفاته (التصاميم وإثبات التحويل) هيتمسحوا نهائيًا. رقم الطلب مش هيتكرر لطلب تاني.</p>
      </div>
      <button
        type="button"
        className="adm-btn adm-delete-btn"
        onClick={() => {
          setTyped("");
          setError("");
          dialog.current?.showModal();
        }}
      >
        <Icon name="trash" size={15} /> حذف الطلب
      </button>
      <dialog ref={dialog} className="adm-delete-dialog" aria-labelledby={`${uid}-t`} aria-describedby={`${uid}-d`} onCancel={(e) => pending && e.preventDefault()}>
        <form
          className="adm-form"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <h2 id={`${uid}-t`}>حذف الطلب <bdi dir="ltr">#{number}</bdi></h2>
          <p id={`${uid}-d`}>الحذف نهائي ومفيش رجوع. اكتب رقم الطلب <b dir="ltr">{number}</b> للتأكيد.</p>
          <div className="adm-f">
            <label htmlFor={`${uid}-n`}>رقم الطلب</label>
            <input id={`${uid}-n`} type="text" inputMode="numeric" dir="ltr" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={String(number)} autoFocus />
          </div>
          {error && <p className="adm-err" role="alert">{error}</p>}
          <div className="adm-return-actions">
            <button type="button" className="adm-btn ghost" disabled={pending} onClick={() => dialog.current?.close()}>إلغاء</button>
            <button type="submit" className="adm-btn adm-delete-btn" disabled={!match || pending}>{pending ? "جاري الحذف…" : "احذف نهائيًا"}</button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
