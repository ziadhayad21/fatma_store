/** Which outline to draw for a DIY product: towels get a towel, everything else an apron. */
export type DiyKind = "apron" | "towel";
export const diyKind = (categorySlug: string): DiyKind => (categorySlug === "towels" ? "towel" : "apron");

/**
 * Clean outline of the blank item, drawn with a dashed line ("your design goes here").
 * Decorative; styles in pages.css (.diy-art). The dashes march on hover of a `.diy-card`.
 */
export function DiyIllustration({ kind, className }: { kind: DiyKind; className?: string }) {
  return (
    <svg
      className={`diy-art${className ? " " + className : ""}`}
      viewBox="0 0 200 240"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "apron" ? (
        <g className="diy-outline">
          {/* neck strap */}
          <path d="M72 46 C 72 14, 128 14, 128 46" />
          {/* bib + skirt */}
          <path d="M70 46 H130 L133 96 C 146 100, 156 104, 160 110 L 168 214 C 124 224, 76 224, 32 214 L 40 110 C 44 104, 54 100, 67 96 Z" />
          {/* waist ties */}
          <path d="M40 112 C 26 118, 18 132, 12 150" />
          <path d="M160 112 C 174 118, 182 132, 188 150" />
          {/* pocket */}
          <path d="M74 160 H126 L124 192 C 108 196, 92 196, 76 192 Z" />
        </g>
      ) : (
        <g className="diy-outline">
          {/* hanging loop */}
          <path d="M90 34 C 90 14, 110 14, 110 34" />
          {/* towel */}
          <rect x="46" y="34" width="108" height="184" rx="6" />
          {/* woven stripes */}
          <path d="M46 182 H154" />
          <path d="M46 194 H154" />
        </g>
      )}
      {/* print area */}
      <g className="diy-print">
        <rect x={kind === "apron" ? 80 : 72} y={kind === "apron" ? 58 : 66} width={kind === "apron" ? 40 : 56} height={kind === "apron" ? 34 : 56} rx="4" />
        <path d={kind === "apron" ? "M100 67 V83 M92 75 H108" : "M100 82 V106 M88 94 H112"} />
      </g>
    </svg>
  );
}
