"use client";

import { useId, useRef, useState, useTransition } from "react";
import { submitSuggestion } from "@/app/actions/suggestions";
import { Icon } from "@/components/ui/Icon";
import { cleanSuggestion, SUGGESTION_MAX } from "@/lib/suggestions";
import type { PublicSuggestion } from "@/lib/types";

const QUICK = ["مقاسات أطفال", "ألوان جديدة", "منتجات جديدة", "تصميمات جديدة"];

/** Same server action, rate limit and anti-spam as before. A sent suggestion shows on the wall right away. */
export function SuggestionForm({ onSent }: { onSent?: (s: PublicSuggestion) => void }) {
  const fieldId = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const ready = text.trim().length > 0;

  // a quick pick goes into the textarea (after what is already written)
  function pick(chip: string) {
    setError("");
    setText((t) => {
      const base = t.trim();
      const next = base ? `${base}، ${chip}` : chip;
      return [...next].slice(0, SUGGESTION_MAX).join("");
    });
    area.current?.focus();
  }

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
        onSent?.(res.suggestion);
      } else setError(res.error);
    });
  }

  return (
    <div className="sugg-card">
      {sent ? (
        <p className="sugg-thanks" role="status">
          <Icon name="check" size={18} /> شكرًا! اقتراحك وصل.
        </p>
      ) : (
        <form className="sugg-form" onSubmit={send} noValidate>
          <div className="sugg-chips" role="group" aria-label="اقتراحات سريعة">
            {QUICK.map((c) => (
              <button key={c} type="button" className="sugg-chip" onClick={() => pick(c)}>
                {c}
              </button>
            ))}
          </div>
          <label htmlFor={fieldId} className="lbl sugg-label">
            <span>اقتراحك</span>
            <span className="muted" aria-live="polite">{[...text].length}/{SUGGESTION_MAX}</span>
          </label>
          <textarea
            ref={area}
            id={fieldId}
            className="inp"
            rows={4}
            maxLength={SUGGESTION_MAX}
            placeholder="منتج نفسك تلاقيه، لون، مقاس… قولنا"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fieldId}-e` : undefined}
          />
          {error && <span className="err" id={`${fieldId}-e`} role="alert">{error}</span>}
          <button type="submit" className="btn btn-d btn-block sugg-send" data-ready={ready || undefined} disabled={pending || !ready} aria-busy={pending}>
            {pending ? "بنبعت…" : "إرسال"}
          </button>
        </form>
      )}
    </div>
  );
}
