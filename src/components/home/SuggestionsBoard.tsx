"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { loadMoreSuggestions } from "@/app/actions/suggestions";
import { Doodle } from "@/components/ui/Doodle";
import type { PublicSuggestion } from "@/lib/types";
import { SuggestionForm } from "./SuggestionForm";

const keyOf = (s: PublicSuggestion) => `${s.created_at}|${s.text.slice(0, 24)}`;

// true once hydrated in a browser that allows motion (server / hydration render: false)
const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(cb: () => void) {
  const m = window.matchMedia(motionQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
const useAnimate = () =>
  useSyncExternalStore(subscribeMotion, () => !window.matchMedia(motionQuery).matches && "IntersectionObserver" in window, () => false);

/** One speech bubble. `fresh` = just sent from this page (pops in instead of the scroll fade). */
function Bubble({ s, index, animate, fresh }: { s: PublicSuggestion; index: number; animate: boolean; fresh: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!animate || fresh || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [animate, fresh]);

  return (
    <li
      ref={ref}
      className="bubble"
      data-tint={index % 4}
      data-in={!animate || inView || fresh ? "" : undefined}
      data-fresh={fresh || undefined}
      // stagger the scroll fade by position, and give every bubble its own float phase
      style={{ "--d": `${(index % 6) * 80}ms`, "--f": `${-((index * 1.7) % 6).toFixed(1)}s` } as React.CSSProperties}
    >
      <span className="bubble-who" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <circle cx="12" cy="8.5" r="3.6" />
          <path d="M4.8 19.5c1.2-3.6 4-5.4 7.2-5.4s6 1.8 7.2 5.4" />
        </svg>
      </span>
      <p className="bubble-text" dir="auto">{s.text}</p>
    </li>
  );
}

/** Heading + form, and the wall of bubbles (hidden when empty: the form is centred then). */
export function SuggestionsBoard({ initial, initialHasMore }: { initial: PublicSuggestion[]; initialHasMore: boolean }) {
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, start] = useTransition();
  const animate = useAnimate();
  const empty = items.length === 0;

  function more() {
    const last = items[items.length - 1];
    if (!last) return;
    setError("");
    start(async () => {
      try {
        const res = await loadMoreSuggestions(last.created_at);
        setItems((list) => {
          const seen = new Set(list.map(keyOf));
          return [...list, ...res.items.filter((s) => !seen.has(keyOf(s)))];
        });
        setHasMore(res.hasMore);
      } catch {
        setError("حصلت مشكلة. جرّب تاني.");
      }
    });
  }

  return (
    <div className="sugg-layout" data-empty={empty || undefined}>
      <div className="sugg-side">
        <div className="sugg-head rv">
          <span className="eyebrow">اقتراحاتكم</span>
          <h2 className="h2" id="sugg-title">
            إنتوا بتقترحوا… وإحنا{" "}
            <span className="mark">
              بنسمع
              <Doodle kind="underline" className="dl-underline" />
            </span>
            .
          </h2>
          <p className="sugg-lead">قولولنا نفسكم في إيه، وكل اقتراح بيوصلنا.</p>
        </div>
        <SuggestionForm
          onSent={(s) => {
            setFresh(keyOf(s));
            setItems((list) => [s, ...list.filter((x) => keyOf(x) !== keyOf(s))]);
          }}
        />
      </div>

      {!empty && (
        <div className="sugg-wall-wrap">
          <ul className="sugg-wall" data-anim={animate ? "" : undefined} aria-label="اقتراحات الزباين">
            {items.map((s, i) => (
              <Bubble key={keyOf(s)} s={s} index={i} animate={animate} fresh={fresh === keyOf(s)} />
            ))}
          </ul>
          {hasMore && (
            <div className="sugg-more">
              <button type="button" className="sugg-more-link" onClick={more} disabled={loading} aria-busy={loading}>
                {loading ? "بنحمّل…" : "عرض المزيد"}
              </button>
              {error && <span className="err" role="alert">{error}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
