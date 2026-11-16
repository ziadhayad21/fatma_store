export function CategoryIcon({ slug, size = 18 }: { slug: string; size?: number }) {
  if (slug === "bags") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8h12l-1 12H7L6 8z" />
        <path d="M9 8V5a3 3 0 0 1 6 0v3" />
      </svg>
    );
  }
  if (slug === "towels") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M4 8h16M4 14h16" />
      </svg>
    );
  }
  // aprons / bibs / default
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3h8l2 6v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9l2-6z" />
      <path d="M9 13h6v4H9z" />
    </svg>
  );
}

export function Rays({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ffb91f"
      strokeWidth="2.5"
      strokeLinecap="round"
      style={{ transform: flip ? "scaleX(-1)" : undefined }}
      aria-hidden="true"
    >
      <path d="M4 14L2 17" />
      <path d="M7 9L4 6" />
      <path d="M14 6L16 2" />
    </svg>
  );
}
