const paths = {
  search: ["M20 20l-3.5-3.5"],
  user: ["M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"],
  bag: ["M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z", "M9 8V6.5a3 3 0 0 1 6 0V8"],
  menu: ["M4 7h16M4 12h16M4 17h16"],
  close: ["M6 6l12 12M18 6L6 18"],
  trash: ["M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"],
  arrow: ["M19 12H5m6-6l-6 6 6 6"],
  plus: ["M12 5v14M5 12h14"],
  minus: ["M5 12h14"],
  heart: ["M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"],
  chevronL: ["M15 5l-7 7 7 7"],
  chevronR: ["M9 5l7 7-7 7"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  upload: ["M12 16V4m-5 5l5-5 5 5", "M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"],
  box: ["M4 7l8-4 8 4-8 4z", "M4 7v10l8 4 8-4V7M12 11v10"],
  type: ["M4 7V5h16v2M9 19h6M12 5v14"],
} as const;

export type IconName = keyof typeof paths;

type Props = {
  name: IconName;
  size?: number;
  /** adds the `.ar` class so a parent .btn/.lnk/.tile can nudge it on hover */
  nudge?: boolean;
  className?: string;
};

export function Icon({ name, size = 20, nudge = false, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      {name === "search" && <circle className="ic" cx="11" cy="11" r="7" />}
      {name === "user" && <circle className="ic" cx="12" cy="8" r="4" />}
      {paths[name].map((d) => (
        <path key={d} className={nudge ? "ic ar" : "ic"} d={d} />
      ))}
    </svg>
  );
}
