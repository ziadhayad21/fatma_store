type Kind = "underline" | "heart";

/** Hand-drawn pen strokes (single path each, drawn with stroke-dashoffset; pathLength = 1). Paths come from the design file. */
const SHAPES: Record<Kind, { viewBox: string; d: string; preserve?: string }> = {
  // under a word; starts at the right because the page is RTL
  underline: { viewBox: "0 0 300 20", d: "M296 10 C 220 4, 140 16, 70 9 S 20 8, 4 12", preserve: "none" },
  heart: { viewBox: "0 0 60 56", d: "M30 50 C 8 36, 2 22, 8 13 C 14 4, 26 6, 30 16 C 34 6, 46 4, 52 13 C 58 22, 52 36, 30 50 Z" },
};

/**
 * Reusable hand-drawn mark (red pen stroke). Place it inside a `position: relative` wrapper (`.mark`) and size it
 * with a class. It draws itself while scrolling into view (CSS `animation-timeline: view()`), is simply visible where
 * that is unsupported, and static under prefers-reduced-motion. Styles: pages.css (.doodle).
 */
export function Doodle({ kind, className }: { kind: Kind; className?: string }) {
  const s = SHAPES[kind];
  return (
    <svg className={`doodle${className ? " " + className : ""}`} viewBox={s.viewBox} preserveAspectRatio={s.preserve} aria-hidden="true" focusable="false">
      <path d={s.d} pathLength={1} />
    </svg>
  );
}
