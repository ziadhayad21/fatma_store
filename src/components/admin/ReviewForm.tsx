"use client";

import { useActionState } from "react";
import { saveReview, type ReviewState } from "@/app/actions/admin-reviews";
import { AVATAR_COLORS } from "@/lib/reviews";

export type ReviewFormValues = {
  id: string; // "new" for a new review
  customer_name: string;
  text: string;
  product_id: string;
  avatar_color: string;
  sort: string;
  is_published: boolean;
};

export function ReviewForm({ values: v, products }: { values: ReviewFormValues; products: { id: string; name_ar: string }[] }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(saveReview, { ok: false, message: "" });
  const e = state.fieldErrors ?? {};
  const err = (k: string) => (e[k] ? <span className="adm-err" role="alert">{e[k]}</span> : null);
  return (
    <form action={action} className="adm-form">
      <input type="hidden" name="id" value={v.id} />
      <div className="adm-row">
        <div className="adm-f">
          <label htmlFor="customer_name">اسم العميل</label>
          <input id="customer_name" name="customer_name" type="text" defaultValue={v.customer_name} required maxLength={80} aria-invalid={!!e.customer_name} />
          {err("customer_name")}
        </div>
        <div className="adm-f">
          <label htmlFor="product_id">اشترت (اختياري)</label>
          <select id="product_id" name="product_id" defaultValue={v.product_id}>
            <option value="">— من غير منتج —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name_ar}</option>
            ))}
          </select>
          {err("product_id")}
        </div>
      </div>
      <div className="adm-f">
        <label htmlFor="text">نص الرأي (رأي حقيقي من عميل فعلاً)</label>
        <textarea id="text" name="text" defaultValue={v.text} required maxLength={600} rows={5} aria-invalid={!!e.text} />
        {err("text")}
      </div>
      <div className="adm-row">
        <div className="adm-f">
          <label htmlFor="avatar_color">لون الدايرة</label>
          <select id="avatar_color" name="avatar_color" defaultValue={v.avatar_color}>
            <option value="">تلقائي (بيتبدّل بين الألوان)</option>
            {AVATAR_COLORS.map((c) => (
              <option key={c.hex} value={c.hex}>{c.name}</option>
            ))}
          </select>
          {err("avatar_color")}
        </div>
        <div className="adm-f">
          <label htmlFor="sort">الترتيب</label>
          <input id="sort" name="sort" type="text" inputMode="numeric" defaultValue={v.sort} dir="ltr" aria-invalid={!!e.sort} />
          {err("sort")}
        </div>
      </div>
      <label className="adm-check">
        <input type="checkbox" name="is_published" defaultChecked={v.is_published} />
        ظاهر على الموقع (القسم بيظهر لما يبقى 3 آراء ظاهرة على الأقل)
      </label>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="adm-btn" type="submit" disabled={pending}>{pending ? "جاري الحفظ…" : "حفظ"}</button>
        {state.message && <span className={state.ok ? "adm-ok" : "adm-err"} role="status">{state.message}</span>}
      </div>
    </form>
  );
}
