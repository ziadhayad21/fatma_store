import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MAX_QTY } from "@/lib/limits";
import type { FontId, OrderMode } from "@/lib/types";

export type CartLine = {
  key: string;
  productId: string; // product slug
  mode: OrderMode;
  text: string | null;
  font: FontId | null;
  designPath: string | null; // path in the private storage bucket
  designName: string | null; // original file name, display only
  color?: import("@/lib/product-rules").ProductColor | null;
  notes?: string | null;
  qty: number;
};

export type NewLine = Omit<CartLine, "key" | "qty"> & { qty?: number };

export function lineKey(l: Pick<CartLine, "productId" | "mode" | "text" | "font" | "designPath" | "color"> & { notes?: string | null }) {
  const parts = [l.productId, l.mode, l.text ?? "", l.font ?? "", l.designPath ?? ""];
  if (l.color) parts.push(l.color);
  if (l.notes) parts.push(l.notes);
  return parts.join("|");
}

type CartState = {
  lines: CartLine[];
  add: (line: NewLine) => void;
  /** Save an edited line in place (merges into an identical existing line if the key now collides). */
  replace: (oldKey: string, line: NewLine) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (line) =>
        set((s) => {
          const key = lineKey(line);
          const qty = line.qty ?? 1;
          const found = s.lines.find((l) => l.key === key);
          if (found) {
            return {
              lines: s.lines.map((l) =>
                l.key === key ? { ...l, qty: Math.min(l.qty + qty, MAX_QTY) } : l,
              ),
            };
          }
          return { lines: [...s.lines, { ...line, key, qty: Math.min(qty, MAX_QTY) }] };
        }),
      replace: (oldKey, line) =>
        set((s) => {
          const key = lineKey(line);
          const qty = Math.max(1, Math.min(line.qty ?? 1, MAX_QTY));
          const at = s.lines.findIndex((l) => l.key === oldKey);
          const others = s.lines.filter((l) => l.key !== oldKey);
          if (others.some((l) => l.key === key)) {
            return { lines: others.map((l) => (l.key === key ? { ...l, qty: Math.min(l.qty + qty, MAX_QTY) } : l)) };
          }
          const next: CartLine = { ...line, key, qty };
          const out = [...others];
          out.splice(at < 0 ? out.length : at, 0, next);
          return { lines: out };
        }),
      setQty: (key, qty) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.key === key ? { ...l, qty: Math.max(1, Math.min(qty, MAX_QTY)) } : l,
          ),
        })),
      remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
      clear: () => set({ lines: [] }),
    }),
    {
      name: "fatma-cart",
      version: 1,
      // Hydrate manually after mount so SSR markup always matches (see useHydrated).
      skipHydration: true,
    },
  ),
);
