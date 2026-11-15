"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ProductSort } from "@/lib/types";

export function SortSelect({ value }: { value: ProductSort }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <>
      <label htmlFor="sort" className="vh">ترتيب حسب</label>
      <select
        id="sort"
        className="sel"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          // changing the sort resets pagination
          router.replace(v === "new" ? pathname : `${pathname}?sort=${v}`, { scroll: false });
        }}
      >
        <option value="new">الأحدث</option>
        <option value="low">السعر: من الأقل</option>
        <option value="high">السعر: من الأعلى</option>
      </select>
    </>
  );
}
