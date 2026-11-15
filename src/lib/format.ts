/** 450 -> "450 ج.م" */
export function formatPrice(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(2)} ج.م`;
}
