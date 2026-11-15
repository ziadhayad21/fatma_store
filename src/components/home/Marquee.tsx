/** Line icons from the design file (24x24, drawn with the red stroke defined in pages.css). */
const ITEMS: { label: string; icon: React.ReactNode }[] = [
  {
    label: "فوط",
    icon: (
      <>
        <path d="M5 3h14v18H5z" />
        <path d="M5 15h14M5 18h14" />
      </>
    ),
  },
  {
    label: "مريلات",
    icon: (
      <>
        <path d="M9 3c0 2 1.3 3 3 3s3-1 3-3" />
        <path d="M8 6h8l1 4 3 1-1 10H5L4 11l3-1z" />
        <path d="M9.5 14h5v3h-5z" />
      </>
    ),
  },
  {
    label: "شنط",
    icon: (
      <>
        <path d="M5 8h14l-1 13H6z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </>
    ),
  },
  {
    label: "باسمك",
    icon: (
      <>
        <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
        <path d="M13.5 6.5l4 4" />
      </>
    ),
  },
  {
    label: "بتصميمك",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="2" />
        <path d="M21 17l-5-5-9 8" />
      </>
    ),
  },
  {
    label: "هدية",
    icon: (
      <>
        <rect x="3" y="9" width="18" height="12" />
        <path d="M3 13h18M12 9v12M12 9c-1.5-3-5-3.5-5-1s5 1 5 1 5 1.5 5-1-3.5-2-5 1" />
      </>
    ),
  },
];

/**
 * One straight band that scrolls continuously (45 s), pauses on hover. Decorative (aria-hidden); static under
 * reduced motion. The animation moves by exactly one half, so the track is two identical halves, each wider than any screen.
 */
export function Marquee() {
  const half = (k: number) =>
    [0, 1].flatMap((r) =>
      ITEMS.map((it) => (
        <span className="mq-item" key={`${k}-${r}-${it.label}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            {it.icon}
          </svg>
          {it.label}
        </span>
      )),
    );
  return (
    <div className="mq" aria-hidden="true">
      <div className="mq-t">
        {half(0)}
        {half(1)}
      </div>
    </div>
  );
}
