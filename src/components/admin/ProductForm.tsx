"use client";

import { useActionState } from "react";
import { saveProduct, type SaveState } from "@/app/actions/admin-catalog";
import type { ProductImage } from "@/lib/types";
import { ImagesField } from "./ImagesField";

export type ProductFormValues = {
  id: string; // "new" for a new product
  name_ar: string;
  slug: string;
  category_id: string;
  description_ar: string;
  details_ar: string;
  care_ar: string;
  base_price: string;
  personalization_fee: string;
  sort: string;
  is_active: boolean;
  images: ProductImage[];
};

export function ProductForm({ values: v, categories }: { values: ProductFormValues; categories: { id: string; name_ar: string }[] }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveProduct, { ok: false, message: "" });
  const e = state.fieldErrors ?? {};
  const err = (k: string) => (e[k] ? <span className="adm-err" role="alert">{e[k]}</span> : null);
  return (
    <form action={action} className="adm-form">
      <input type="hidden" name="id" value={v.id} />
      <div className="adm-row">
        <div className="adm-f">
          <label htmlFor="name_ar">اسم المنتج</label>
          <input id="name_ar" name="name_ar" type="text" defaultValue={v.name_ar} required maxLength={160} aria-invalid={!!e.name_ar} />
          {err("name_ar")}
        </div>
        <div className="adm-f">
          <label htmlFor="category_id">القسم</label>
          <select id="category_id" name="category_id" defaultValue={v.category_id} required aria-invalid={!!e.category_id}>
            <option value="" disabled>اختار القسم</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
          </select>
          {err("category_id")}
        </div>
      </div>
      <div className="adm-f">
        <label htmlFor="slug">الرابط (إنجليزي)</label>
        <input id="slug" name="slug" type="text" defaultValue={v.slug} required dir="ltr" maxLength={80} aria-invalid={!!e.slug} />
        <span className="adm-hint" dir="ltr" style={{ textAlign: "right" }}>/products/{v.slug || "your-slug"}</span>
        <span className="adm-hint">لو غيّرت الرابط، الرابط القديم هيبطّل يشتغل.</span>
        {err("slug")}
      </div>
      <div className="adm-row">
        <div className="adm-f">
          <label htmlFor="base_price">السعر (ج.م)</label>
          <input id="base_price" name="base_price" type="text" inputMode="decimal" defaultValue={v.base_price} required dir="ltr" aria-invalid={!!e.base_price} />
          {err("base_price")}
        </div>
        <div className="adm-f">
          <label htmlFor="personalization_fee">تكلفة الطباعة / التخصيص (ج.م)</label>
          <input id="personalization_fee" name="personalization_fee" type="text" inputMode="decimal" defaultValue={v.personalization_fee} required dir="ltr" aria-invalid={!!e.personalization_fee} />
          <span className="adm-hint">بتتضاف على السعر لما العميل يختار «باسمك» أو «بتصميمك».</span>
          {err("personalization_fee")}
        </div>
      </div>
      <div className="adm-f">
        <label htmlFor="description_ar">الوصف</label>
        <textarea id="description_ar" name="description_ar" defaultValue={v.description_ar} maxLength={4000} />
        {err("description_ar")}
      </div>
      <div className="adm-row">
        <div className="adm-f">
          <label htmlFor="details_ar">تفاصيل المنتج</label>
          <textarea id="details_ar" name="details_ar" defaultValue={v.details_ar} maxLength={4000} />
        </div>
        <div className="adm-f">
          <label htmlFor="care_ar">العناية بالقماش</label>
          <textarea id="care_ar" name="care_ar" defaultValue={v.care_ar} maxLength={4000} />
        </div>
      </div>
      <div className="adm-f">
        <span className="lbl">الصور (الأولى هي الرئيسية، والتانية بتظهر عند تمرير الماوس)</span>
        <ImagesField name="images" initial={v.images} max={8} />
        {err("images")}
      </div>
      <div className="adm-row">
        <div className="adm-f">
          <label htmlFor="sort">الترتيب</label>
          <input id="sort" name="sort" type="text" inputMode="numeric" defaultValue={v.sort} dir="ltr" aria-invalid={!!e.sort} />
          <span className="adm-hint">الأصغر بيظهر الأول.</span>
          {err("sort")}
        </div>
        <label className="adm-check" style={{ alignSelf: "end", height: 40 }}>
          <input type="checkbox" name="is_active" defaultChecked={v.is_active} />
          ظاهر على الموقع
        </label>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="adm-btn" type="submit" disabled={pending}>{pending ? "جاري الحفظ…" : "حفظ"}</button>
        {state.message && <span className={state.ok ? "adm-ok" : "adm-err"} role="status">{state.message}</span>}
      </div>
    </form>
  );
}
