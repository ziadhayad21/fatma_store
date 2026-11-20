import { SUGGESTIONS_PAGE } from "@/lib/suggestions";
import type { PublicSuggestion } from "@/lib/types";
import { SuggestionsBoard } from "./SuggestionsBoard";

/**
 * Customer suggestions: the heading + form on the start side, a "wall" of speech bubbles on the other.
 * Anonymous (no names, no dates, never the order). `suggestions` is one page plus one extra row, which only
 * tells whether "عرض المزيد" shows.
 */
export function SuggestionsSection({ suggestions }: { suggestions: PublicSuggestion[] }) {
  return (
    <section className="sec sugg" id="suggestions" aria-labelledby="sugg-title">
      <div className="wrap">
        <SuggestionsBoard initial={suggestions.slice(0, SUGGESTIONS_PAGE)} initialHasMore={suggestions.length > SUGGESTIONS_PAGE} />
      </div>
    </section>
  );
}
