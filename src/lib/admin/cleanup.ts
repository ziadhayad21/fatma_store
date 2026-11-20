/** "تنظيف الملفات القديمة": how old (months) a delivered / cancelled order must be before its files go. */
export const CLEANUP_MONTHS = [3, 6, 12] as const;
export const DEFAULT_CLEANUP_MONTHS = 6;
export const isCleanupMonths = (v: unknown): v is (typeof CLEANUP_MONTHS)[number] =>
  typeof v === "number" && (CLEANUP_MONTHS as readonly number[]).includes(v);

/** 12.3 ميجا (for the cleanup preview / result) */
export const megabytes = (bytes: number) => {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} ميجا` : `${mb.toFixed(1)} ميجا`;
};
