import { designUploader } from "@/lib/upload";
import { useCart } from "@/store/cart";

/** True when another cart line still points at this stored file. */
export function designInUse(path: string | null | undefined, exceptKey?: string) {
  return !!path && useCart.getState().lines.some((l) => l.key !== exceptKey && l.designPath === path);
}

/** Remove a cart line and clean up its uploaded design if nothing else uses it. */
export function removeCartLine(key: string) {
  const line = useCart.getState().lines.find((l) => l.key === key);
  useCart.getState().remove(key);
  if (line?.designPath && !designInUse(line.designPath)) {
    void designUploader.remove(line.designPath).catch(() => {});
  }
}
