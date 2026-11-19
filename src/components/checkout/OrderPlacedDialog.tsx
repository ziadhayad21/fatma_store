"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { submitSuggestion } from "@/app/actions/suggestions";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cleanSuggestion, SUGGESTION_MAX } from "@/lib/suggestions";

export type PlacedOrder = { orderId: string; number: number; deposit: boolean };

/**
 * Success popup shown on the checkout page after placeOrder() succeeded.
 * A native modal <dialog>: the rest of the page is inert, focus stays inside, Esc closes it.
 * The suggestion box is optional and never affects the order.
 */
export function OrderPlacedDialog({ order, open, onClose }: { order: PlacedOrder; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const fieldId = useId();
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    if (!open && d.open) d.close();
  }, [open]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const checked = cleanSuggestion(text);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    start(async () => {
      const res = await submitSuggestion({ text: checked.text, orderId: order.orderId }).catch(() => ({ ok: false as const, error: "حصلت مشكلة. جرّب تاني بعد شوية." }));
      if (res.ok) setSent(true);
      else setError(res.error);
    });
  }

  return (
    <dialog
      ref={ref}
      className="op-dialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={(e) => {
        e.preventDefault(); // Esc: close through state so React stays in charge
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
    >
      <div className="op-card">
        <button type="button" className="ib op-close" aria-label="إغلاق" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>

        <span className="op-check" aria-hidden="true">
          <Icon name="check" size={28} />
        </span>
        <h2 id={titleId} className="op-title">تم استلام طلبك</h2>
        <p className="op-number">
          رقم الطلب <bdi dir="ltr">#{order.number}</bdi>
        </p>
        <p id={descId} className="op-line">
          {order.deposit ? "هنراجع تحويل العربون ونتواصل معاك لتأكيد الطلب." : "شكرًا لطلبك! هنتواصل معاك قريب لتأكيد الطلب."}
        </p>

        {sent ? (
          <p className="op-thanks" role="status">
            <Icon name="check" size={18} /> شكرًا! وصلنا اقتراحك.
          </p>
        ) : (
          <form className="op-suggest" onSubmit={send} noValidate>
            <label htmlFor={fieldId} className="lbl">
              <span>عندك اقتراح؟ (اختياري)</span>
              <span className="muted" aria-live="polite">{[...text].length}/{SUGGESTION_MAX}</span>
            </label>
            <textarea
              id={fieldId}
              className="inp"
              rows={3}
              maxLength={SUGGESTION_MAX}
              placeholder="مثلاً: عايزين مريلة أطفال"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${fieldId}-e` : undefined}
            />
            {error && <span className="err" id={`${fieldId}-e`} role="alert">{error}</span>}
            <Button type="submit" variant="l" disabled={pending || !text.trim()} aria-busy={pending}>
              {pending ? "بنبعت…" : "إرسال الاقتراح"}
            </Button>
          </form>
        )}

        <div className="op-actions">
          <Button href="/" block>كمّل تسوّق</Button>
          <Link href={`/order/${order.orderId}`} className="op-details">تفاصيل الطلب</Link>
        </div>
      </div>
    </dialog>
  );
}
