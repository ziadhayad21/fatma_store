"use client";

import { useActionState, useState } from "react";
import { saveCategory, type SaveState } from "@/app/actions/admin-catalog";
import type { ProductImage } from "@/lib/types";
import { CatalogSlugField } from "./CatalogSlugField";
import { ImagesField } from "./ImagesField";

export type CategoryFormValues = {
  id: string; // "new" for a new category
  name_ar: string;
  slug: string;
  description_ar: string;
  promo_title_ar: string;
  sort: string;
  is_active: boolean;
  /** products are sold per colour, with a price per colour */
  has_colors: boolean;
  /** products in this category may be "كابلز" (two pieces, one fixed price) */
  allows_couples: boolean;
  /** when true, all products in this category require a deposit at checkout */
  requires_deposit: boolean;
  image: ProductImage[];
};

export function CategoryForm({ values: v }: { values: CategoryFormValues }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveCategory, { ok: false, message: "" });
  const e = state.fieldErrors ?? {};
  const err = (k: string) => (e[k] ? <span className="adm-err" role="alert">{e[k]}</span> : null);
  const [name, setName] = useState(v.name_ar);
  return (
    <form action={action} className="adm-form">
      <input type="hidden" name="id" value={v.id} />
      <div className="adm-row">
        <div className="adm-f">
          <label htmlFor="name_ar">اسم القسم</label>
          <input id="name_ar" name="name_ar" type="text" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} aria-invalid={!!e.name_ar} />
          {err("name_ar")}
        </div>
        <CatalogSlugField name={name} savedSlug={v.slug} kind="category" />
      </div>
      <div className="adm-f">
        <label htmlFor="description_ar">وصف القسم (سطر واحد تحت العنوان)</label>
        <textarea id="description_ar" name="description_ar" defaultValue={v.description_ar} maxLength={600} />
        {err("description_ar")}
      </div>
      <div className="adm-f">
        <label htmlFor="promo_title_ar">عنوان البانر الترويجي</label>
        <input id="promo_title_ar" name="promo_title_ar" type="text" defaultValue={v.promo_title_ar} maxLength={120} />
        <span className="adm-hint">بيظهر جنب المنتجات لما القسم فيه أقل من 3 منتجات.</span>
        {err("promo_title_ar")}
      </div>
      <div className="adm-f">
        <span className="lbl">صورة القسم (للمربع في الصفحة الرئيسية والبانر)</span>
        <ImagesField name="images" initial={v.image} max={1} />
        {err("images")}
      </div>
      <div className="adm-row">
        <div className="adm-f">
          <label htmlFor="sort">الترتيب</label>
          <input id="sort" name="sort" type="text" inputMode="numeric" defaultValue={v.sort} dir="ltr" aria-invalid={!!e.sort} />
          {err("sort")}
        </div>
        <label className="adm-check" style={{ alignSelf: "end", height: 40 }}>
          <input type="checkbox" name="is_active" defaultChecked={v.is_active} />
          ظاهر على الموقع
        </label>
      </div>
      <div className="adm-f">
        <label className="adm-check">
          <input type="checkbox" role="switch" name="has_colors" defaultChecked={v.has_colors} aria-describedby="has-colors-hint" />
          المنتجات بتتباع بالألوان
        </label>
        <span className="adm-hint" id="has-colors-hint">لما يكون مفعّل، كل منتج في القسم ليه ألوان وسعر لكل لون، والعميل يختار اللون من صفحة المنتج.</span>
      </div>
      <div className="adm-f">
        <label className="adm-check">
          <input type="checkbox" role="switch" name="allows_couples" defaultChecked={v.allows_couples} aria-describedby="allows-couples-hint" />
          يسمح بمنتجات كابلز
        </label>
        <span className="adm-hint" id="allows-couples-hint">لما يكون مفعّل، تقدر تعمل في القسم ده منتج كابلز: قطعتين في منتج واحد بسعر ثابت.</span>
      </div>
      <div className="adm-f">
        <label className="adm-check">
          <input type="checkbox" role="switch" name="requires_deposit" defaultChecked={v.requires_deposit} aria-describedby="requires-deposit-hint" />
          عربون إجباري على هذا القسم
        </label>
        <span className="adm-hint" id="requires-deposit-hint">لما يكون مفعّل، كل المنتجات في القسم ده بتتطلب عربون من العميل وقت الطلب.</span>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="adm-btn" type="submit" disabled={pending}>{pending ? "جاري الحفظ…" : "حفظ"}</button>
        {state.message && <span className={state.ok ? "adm-ok" : "adm-err"} role="status">{state.message}</span>}
      </div>
    </form>
  );
}
