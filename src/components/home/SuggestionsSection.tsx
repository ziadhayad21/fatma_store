import { Doodle } from "@/components/ui/Doodle";
import { SUGGESTIONS_PAGE } from "@/lib/suggestions";
import type { PublicSuggestion } from "@/lib/types";
import { SuggestionsBoard } from "./SuggestionsBoard";

/**
 * Customer suggestions, all public (no names, never the order), as note cards + the form.
 * `suggestions` is one page plus one extra row, which only tells whether "عرض المزيد" shows.
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
        <SuggestionsBoard initial={suggestions.slice(0, SUGGESTIONS_PAGE)} initialHasMore={suggestions.length > SUGGESTIONS_PAGE} />
      </div>
    </section>
  );
}
