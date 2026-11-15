/** Avatar colour cycle for review cards (round avatar showing the first letter of the customer name). */
export const AVATAR_COLORS = [
  { hex: "#F6D6DC", fg: "#8E1B2C", name: "وردي فاتح" },
  { hex: "#F6E3A6", fg: "#6B4E00", name: "أصفر" },
  { hex: "#141414", fg: "#FAF7F2", name: "أسود" },
  { hex: "#E9E1D3", fg: "#3A3732", name: "رملي" },
] as const;

/** The colour used for review `index` when the admin did not pick one (cycles blush, mustard, ink, sand). */
export function avatarColor(chosen: string | null, index: number): string {
  if (chosen && /^#[0-9A-Fa-f]{6}$/.test(chosen)) return chosen.toUpperCase();
  return AVATAR_COLORS[index % AVATAR_COLORS.length].hex;
}

/** Text colour for a background: the design's pairing for the four palette colours, otherwise light-on-dark / ink-on-light. */
export function avatarTextColor(bg: string): string {
  const known = AVATAR_COLORS.find((c) => c.hex.toLowerCase() === bg.toLowerCase());
  if (known) return known.fg;
  const n = parseInt(bg.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum < 0.5 ? "#FAF7F2" : "#141414";
}

/** First letter of the name (works for Arabic and Latin). */
export function firstLetter(name: string): string {
  return ([...name.trim()][0] ?? "؟").toUpperCase();
}

/** Minimum published reviews before the section appears on the home page. */
export const MIN_REVIEWS = 3;
