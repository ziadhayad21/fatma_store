"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { loadMoreSuggestions } from "@/app/actions/suggestions";
import { relativeTime } from "@/lib/suggestions";
import type { PublicSuggestion } from "@/lib/types";
import { SuggestionForm } from "./SuggestionForm";

const keyOf = (s: PublicSuggestion) => `${s.created_at}|${s.text.slice(0, 24)}`;

// ---- client-only values, read through useSyncExternalStore (server / hydration render: null)
const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(cb: () => void) {
  const m = window.matchMedia(motionQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
/** true once hydrated in a browser that allows motion */
const useAnimate = () =>
  useSyncExternalStore(subscribeMotion, () => !window.matchMedia(motionQuery).matches && "IntersectionObserver" in window, () => false);

function subscribeMinute(cb: () => void) {
  const id = window.setInterval(cb, 60_000);
  return () => window.clearInterval(id);
}
/** the current minute (re-renders once a minute); 0 on the server so dates render only in the browser */
const useNowMinute = () => useSyncExternalStore(subscribeMinute, () => Math.floor(Date.now() / 60_000), () => 0);

function Note({ s, index, animate, nowMinute }: { s: PublicSuggestion; index: number; animate: boolean; nowMinute: number }) {
  const ref = useRef<HTMLLIElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!animate || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [animate]);

  return (
    <li
      ref={ref}
      className="note"
      data-tint={index % 3}
      data-in={!animate || inView ? "" : undefined}
      style={{ "--d": `${(index % 3) * 90}ms` } as React.CSSProperties}
    >
      <span className="note-q" aria-hidden="true">
        &rdquo;
      </span>
      <p className="note-text" dir="auto">{s.text}</p>
      <time className="note-date" dateTime={s.created_at}>
        {nowMinute ? relativeTime(s.created_at, nowMinute * 60_000 + 59_999) : " "}
      </time>
    </li>
  );
}

/** The note grid, "عرض المزيد", and the form (a sent suggestion appears first right away). */
export function SuggestionsBoard({ initial, initialHasMore }: { initial: PublicSuggestion[]; initialHasMore: boolean }) {
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState("");
  const [loading, start] = useTransition();
  const animate = useAnimate();
  const nowMinute = useNowMinute();

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
    <>
      {items.length > 0 && (
        <ul className="notes" data-anim={animate ? "" : undefined} aria-label="اقتراحات الزباين">
          {items.map((s, i) => (
            <Note key={keyOf(s)} s={s} index={i} animate={animate} nowMinute={nowMinute} />
          ))}
        </ul>
      )}
      {hasMore && (
        <div className="notes-more">
          <button type="button" className="btn btn-l" onClick={more} disabled={loading} aria-busy={loading}>
            {loading ? "بنحمّل…" : "عرض المزيد"}
          </button>
          {error && <span className="err" role="alert">{error}</span>}
        </div>
      )}
      <SuggestionForm onSent={(s) => setItems((list) => [s, ...list.filter((x) => keyOf(x) !== keyOf(s))])} />
    </>
  );
}
