import { Doodle } from "@/components/ui/Doodle";
import type { PublicSuggestion } from "@/lib/types";
import { SuggestionForm } from "./SuggestionForm";

const PILL: Partial<Record<PublicSuggestion["status"], string>> = { reviewing: "تحت الدراسة", done: "اتنفّذ ✓" };

/**
 * Suggestions the admin chose to show (no customer names, never the order), plus a small form.
 * The grid is hidden when nothing is public; the form always shows.
 */
export function SuggestionsSection({ suggestions }: { suggestions: PublicSuggestion[] }) {
  return (
    <section className="sec sugg" id="suggestions" aria-labelledby="sugg-title">
      <div className="wrap">
        <div className="sh rv sugg-head">
          <div>
            <span className="eyebrow">اقتراحاتكم</span>
            <h2 className="h2" id="sugg-title">
              <span className="mark">
                طلبتوا… وعملناها
                <Doodle kind="underline" className="dl-underline" />
              </span>
            </h2>
          </div>
        </div>

        {suggestions.length > 0 && (
          <ul className="sugg-grid">
            {suggestions.map((s, i) => (
              <li key={`${s.created_at}-${i}`} className="sugg-card">
                {PILL[s.status] && (
                  <span className="sugg-pill" data-s={s.status}>
                    {PILL[s.status]}
                  </span>
                )}
                <p className="sugg-text" dir="auto">{s.text}</p>
                {s.admin_reply && (
                  <p className="sugg-reply">
                    <span className="sugg-reply-by">رد فاطمة</span>
                    <span dir="auto">{s.admin_reply}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <SuggestionForm />
      </div>
    </section>
  );
}
