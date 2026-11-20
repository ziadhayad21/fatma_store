"use client";

import { useId, useState, useTransition } from "react";
import { submitSuggestion } from "@/app/actions/suggestions";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cleanSuggestion, SUGGESTION_MAX } from "@/lib/suggestions";

/** Same server action and rate limit as the order popup; new suggestions reach the admin as not public. */
export function SuggestionForm() {
  const fieldId = useId();
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function send(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const checked = cleanSuggestion(text);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    start(async () => {
      const res = await submitSuggestion({ text: checked.text }).catch(() => ({ ok: false as const, error: "حصلت مشكلة. جرّب تاني بعد شوية." }));
      if (res.ok) {
        setSent(true);
        setText("");
      } else setError(res.error);
    });
  }

  return (
    <div className="sugg-form-wrap">
      {sent ? (
        <p className="sugg-thanks" role="status">
          <Icon name="check" size={18} /> شكرًا! هنراجع اقتراحك.
        </p>
      ) : (
        <form className="sugg-form" onSubmit={send} noValidate>
          <label htmlFor={fieldId} className="lbl">
            <span className="sugg-form-title">عندك اقتراح؟</span>
            <span className="muted" aria-live="polite">{[...text].length}/{SUGGESTION_MAX}</span>
          </label>
          <textarea
            id={fieldId}
            className="inp"
            rows={3}
            maxLength={SUGGESTION_MAX}
            placeholder="منتج نفسك تلاقيه، لون، مقاس… قولنا"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fieldId}-e` : undefined}
          />
          {error && <span className="err" id={`${fieldId}-e`} role="alert">{error}</span>}
          <Button type="submit" disabled={pending || !text.trim()} aria-busy={pending}>
            {pending ? "بنبعت…" : "إرسال"}
          </Button>
        </form>
      )}
    </div>
  );
}
