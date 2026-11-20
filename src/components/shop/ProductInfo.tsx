import { Accordion } from "@/components/ui/Accordion";
import type { Product } from "@/lib/types";

/** "تفاصيل المنتج" and "العناية بالقماش": an empty one is never shown (nothing at all when both are empty). */
export function ProductInfo({ product: p }: { product: Pick<Product, "details_ar" | "care_ar"> }) {
  const items = [
    { title: "تفاصيل المنتج", body: p.details_ar },
    { title: "العناية بالقماش", body: p.care_ar },
  ].filter((it) => it.body?.trim());
  if (items.length === 0) return null;
  return (
    <div className="rise d4">
      <Accordion defaultOpen={null} items={items} />
    </div>
  );
}
