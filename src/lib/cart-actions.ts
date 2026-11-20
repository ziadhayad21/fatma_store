import { lineDesignPaths } from "@/lib/couples";
import { designUploader } from "@/lib/upload";
import { useCart } from "@/store/cart";

/** True when another cart line still points at this stored file (as its design or a piece's). */
export function designInUse(path: string | null | undefined, exceptKey?: string) {
  return !!path && useCart.getState().lines.some((l) => l.key !== exceptKey && lineDesignPaths(l).includes(path));
}

/** Remove a cart line and clean up its uploaded designs if nothing else uses them. */
export function removeCartLine(key: string) {
  const line = useCart.getState().lines.find((l) => l.key === key);
  useCart.getState().remove(key);
  for (const path of line ? lineDesignPaths(line) : []) {
    if (!designInUse(path)) void designUploader.remove(path).catch(() => {});
  }
}
