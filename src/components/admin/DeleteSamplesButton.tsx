"use client";

import { deleteSampleReviews } from "@/app/actions/admin-reviews";

/** Removes every review marked as a sample (asks for confirmation first). */
export function DeleteSamplesButton({ count }: { count: number }) {
  return (
    <form
      action={deleteSampleReviews}
      onSubmit={(e) => {
        if (!window.confirm(`هتتمسح ${count} رأي تجريبي نهائيًا. الآراء الحقيقية مش هتتأثر. متأكد؟`)) e.preventDefault();
      }}
    >
      <button className="adm-btn ghost" type="submit">حذف كل الآراء التجريبية ({count})</button>
    </form>
  );
}
