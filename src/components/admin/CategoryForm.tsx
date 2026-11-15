"use client";

import { useActionState } from "react";
import { saveCategory, type SaveState } from "@/app/actions/admin-catalog";
import type { ProductImage } from "@/lib/types";
import { ImagesField } from "./ImagesField";

export type CategoryFormValues = {
  id: string; // "new" for a new category
  name_ar: string;
  slug: string;
  description_ar: string;
  promo_title_ar: string;
  sort: string;
  is_active: boolean;
  accent_color: string;
  image: ProductImage[];
};

export function CategoryForm({ values: v }: { values: CategoryFormValues }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveCategory, { ok: false, message: "" });
  const e = state.fieldErrors ?? {};
  const err = (k: string) => (e[k] ? <span className="adm-err" role="alert">{e[k]}</span> : null);
  const isNew = v.id === "new";
  return (
    <form action={action} className="adm-form">
      <input type="hidden" name="id" value={v.id} />
      <div className="adm-row">
        <div className="adm-f">
          <label htmlFor="name_ar">اسم القسم</label>
          <input id="name_ar" name="name_ar" type="text" defaultValue={v.name_ar} required maxLength={80} aria-invalid={!!e.name_ar} />
          {err("name_ar")}
        </div>
        <div className="adm-f">
          <label htmlFor="slug">الرابط (إنجليزي)</label>
          <input id="slug" name="slug" type="text" defaultValue={v.slug} required dir="ltr" maxLength={60} readOnly={!isNew} aria-invalid={!!e.slug} />
          <span className="adm-hint" dir="ltr" style={{ textAlign: "right" }}>/collections/{v.slug || "your-slug"}</span>
          {!isNew && <span className="adm-hint">ثابت بعد الإنشاء عشان الروابط متتكسرش.</span>}
          {err("slug")}
        </div>
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
      <div className="adm-f">
        <label htmlFor="accent_color">لون القسم (بيظهر لما الزائر يعدّي على المربع في الرئيسية)</label>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input id="accent_color" name="accent_color" type="color" defaultValue={v.accent_color} style={{ width: 56, height: 40, padding: 2 }} aria-invalid={!!e.accent_color} />
          <span className="adm-hint" dir="ltr">{v.accent_color}</span>
        </div>
        {err("accent_color")}
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
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="adm-btn" type="submit" disabled={pending}>{pending ? "جاري الحفظ…" : "حفظ"}</button>
        {state.message && <span className={state.ok ? "adm-ok" : "adm-err"} role="status">{state.message}</span>}
      </div>
    </form>
  );
}
