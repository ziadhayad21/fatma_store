"use client";

import { useActionState, useState } from "react";
import { saveProduct, type SaveState } from "@/app/actions/admin-catalog";
import { PriceDisplay } from "@/components/shop/PriceDisplay";
import { parseMoney } from "@/lib/admin/validate";
import { productPrice, validDiscountPercent } from "@/lib/pricing/discount";
import type { ProductImage } from "@/lib/types";
import { DEFAULT_PIECE_LABELS, PIECE_LABEL_MAX } from "@/lib/couples";
import { CatalogSlugField } from "./CatalogSlugField";
import { ImagesField } from "./ImagesField";

export type ProductColorValue = { id: string; name_ar: string; hex: string; available: boolean; price: string };

export type ProductFormValues = {
  id: string; // "new" for a new product
  name_ar: string;
  slug: string;
  category_id: string;
  description_ar: string;
  details_ar: string;
  care_ar: string;
  base_price: string;
  discount_percent: string;
  sort: string;
  is_active: boolean;
  /** "اصنعها بنفسك": no "as is" option, shown first in its collection */
  is_diy: boolean;
  /** "كابلز": 2 pieces, one fixed price (base_price); colours only switch on/off */
  is_couples: boolean;
  piece_labels: [string, string];
  images: ProductImage[];
  /** every active colour; used when the category sells by colour */
  colors: ProductColorValue[];
};

type CategoryOption = { id: string; name_ar: string; has_colors: boolean };

export function ProductForm({ values: v, categories }: { values: ProductFormValues; categories: CategoryOption[] }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveProduct, { ok: false, message: "" });
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState(v.name_ar);
  const [categoryId, setCategoryId] = useState(v.category_id);
  const [regularPrice, setRegularPrice] = useState(v.base_price);
  const [colors, setColors] = useState(v.colors);
  const [discountEnabled, setDiscountEnabled] = useState(v.discount_percent !== "");
  const [discount, setDiscount] = useState(v.discount_percent);
  const [couples, setCouples] = useState(v.is_couples);
  const hasColors = categories.find((c) => c.id === categoryId)?.has_colors ?? false;
  // couples products have one fixed price: colours only switch on/off
  const perColorPrices = hasColors && !couples;

  const patchColor = (id: string, patch: Partial<ProductColorValue>) =>
    setColors((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  // discount preview: the single price, or the lowest available colour price
  const colorPrices = colors.filter((c) => c.available).map((c) => parseMoney(c.price)).filter((n): n is number => typeof n === "number");
  const previewBase = perColorPrices ? (colorPrices.length ? Math.min(...colorPrices) : null) : parseMoney(regularPrice);
  const parsedDiscount = parseMoney(discount, 100);
  const preview = typeof previewBase === "number" && typeof parsedDiscount === "number" && validDiscountPercent(parsedDiscount)
    ? productPrice({ base_price: previewBase, discount_percent: parsedDiscount })
    : null;

  const e = state.fieldErrors ?? {};
  const err = (k: string) => (e[k] ? <span className="adm-err" role="alert">{e[k]}</span> : null);
  return (
    <form action={action} className="adm-form" onSubmit={(event) => { if (uploading) event.preventDefault(); }}>
      <input type="hidden" name="id" value={v.id} />
      <div className="adm-row">
        <div className="adm-f">
          <label htmlFor="name_ar">اسم المنتج</label>
          <input id="name_ar" name="name_ar" type="text" value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} aria-invalid={!!e.name_ar} />
          {err("name_ar")}
        </div>
        <div className="adm-f">
          <label htmlFor="category_id">القسم</label>
          <select id="category_id" name="category_id" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required aria-invalid={!!e.category_id}>
            <option value="" disabled>اختار القسم</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
          </select>
          {err("category_id")}
        </div>
      </div>
      <CatalogSlugField name={name} savedSlug={v.slug} kind="product" />

      <div className="adm-f adm-couples">
        <label className="adm-check">
          <input type="checkbox" role="switch" name="is_couples" checked={couples} onChange={(event) => setCouples(event.target.checked)} aria-describedby="couples-hint" />
          منتج كابلز (قطعتين)
        </label>
        <span className="adm-hint" id="couples-hint">قطعتين في منتج واحد: العميل يختار لون واسم أو تصميم لكل قطعة، والسعر ثابت للقطعتين مهما كانت الألوان.</span>
        {couples && (
          <div className="adm-row">
            {[0, 1].map((i) => (
              <div className="adm-f" key={i}>
                <label htmlFor={`piece_label_${i + 1}`}>اسم القطعة {i === 0 ? "الأولى" : "التانية"}</label>
                <input id={`piece_label_${i + 1}`} name={`piece_label_${i + 1}`} type="text" defaultValue={v.piece_labels[i]} placeholder={DEFAULT_PIECE_LABELS[i]} maxLength={PIECE_LABEL_MAX} aria-invalid={!!e[`piece_label_${i + 1}`]} />
                {err(`piece_label_${i + 1}`)}
              </div>
            ))}
          </div>
        )}
      </div>

      {couples && (
        <div className="adm-row">
          <div className="adm-f">
            <label htmlFor="base_price">سعر الكابلز (ج.م)</label>
            <input id="base_price" name="base_price" type="text" inputMode="decimal" value={regularPrice} onChange={(event) => setRegularPrice(event.target.value)} required dir="ltr" aria-invalid={!!e.base_price} />
            <span className="adm-hint">سعر واحد للقطعتين، مهما كانت الألوان أو طريقة الطلب.</span>
            {err("base_price")}
          </div>
        </div>
      )}

      {couples && hasColors ? (
        <fieldset className="adm-f adm-colors" aria-describedby="couple-colors-hint">
          <legend className="lbl">الألوان المتاحة</legend>
          <span className="adm-hint" id="couple-colors-hint">فعّل الألوان اللي العميل يقدر يختارها لكل قطعة. لازم لون واحد على الأقل.</span>
          {colors.map((c) => (
            <div className="adm-color-row adm-color-row--toggle" key={c.id} data-off={!c.available || undefined}>
              <label className="adm-check">
                <input type="checkbox" role="switch" name={`color_available_${c.id}`} checked={c.available} onChange={(event) => patchColor(c.id, { available: event.target.checked })} />
                <span className="adm-swatch" style={{ background: c.hex }} aria-hidden="true" />
                <span>{c.name_ar}</span>
                <span className="adm-hint">{c.available ? "متاح" : "غير متاح"}</span>
              </label>
            </div>
          ))}
          {err("colors")}
        </fieldset>
      ) : couples ? null : hasColors ? (
        <fieldset className="adm-f adm-colors" aria-describedby="colors-hint">
          <legend className="lbl">الألوان والسعر (ج.م)</legend>
          <span className="adm-hint" id="colors-hint">فعّل الألوان المتاحة واكتب سعر كل لون. لازم لون واحد على الأقل. السعر واحد مهما كانت طريقة الطلب.</span>
          {colors.length === 0 && <span className="adm-err" role="alert">مفيش ألوان مفعّلة في قاعدة البيانات.</span>}
          {colors.map((c) => (
            <div className="adm-color-row" key={c.id} data-off={!c.available || undefined}>
              <label className="adm-check">
                <input
                  type="checkbox"
                  role="switch"
                  name={`color_available_${c.id}`}
                  checked={c.available}
                  onChange={(event) => patchColor(c.id, { available: event.target.checked })}
                />
                <span className="adm-swatch" style={{ background: c.hex }} aria-hidden="true" />
                <span>{c.name_ar}</span>
                <span className="adm-hint">{c.available ? "متاح" : "غير متاح"}</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                name={`color_price_${c.id}`}
                value={c.price}
                onChange={(event) => patchColor(c.id, { price: event.target.value })}
                required={c.available}
                placeholder="السعر"
                aria-label={`سعر اللون ${c.name_ar}`}
                aria-invalid={!!e[`color_${c.id}`]}
              />
              {err(`color_${c.id}`)}
            </div>
          ))}
          {err("colors")}
        </fieldset>
      ) : (
        <div className="adm-row">
          <div className="adm-f">
            <label htmlFor="base_price">السعر (ج.م)</label>
            <input id="base_price" name="base_price" type="text" inputMode="decimal" value={regularPrice} onChange={(event) => setRegularPrice(event.target.value)} required dir="ltr" aria-invalid={!!e.base_price} />
            <span className="adm-hint">السعر واحد مهما كانت طريقة الطلب.</span>
            {err("base_price")}
          </div>
        </div>
      )}

      <div className="adm-f">
        <label className="adm-check">
          <input type="checkbox" role="switch" name="discount_enabled" checked={discountEnabled} onChange={(event) => setDiscountEnabled(event.target.checked)} />
          تفعيل الخصم
        </label>
        {discountEnabled && (
          <div className="adm-row">
            <div className="adm-f">
              <label htmlFor="discount_percent">نسبة الخصم (%)</label>
              <input id="discount_percent" name="discount_percent" type="text" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} required dir="ltr" aria-invalid={!!e.discount_percent} />
              {perColorPrices && <span className="adm-hint">بتتطبق على سعر كل لون.</span>}
              {err("discount_percent")}
            </div>
            <div className="adm-f" aria-live="polite">
              <span className="lbl">معاينة السعر{perColorPrices ? " (أقل لون)" : ""}</span>
              {preview ? <PriceDisplay {...preview} /> : <span className="adm-hint">اكتب السعر ونسبة خصم صحيحة.</span>}
            </div>
          </div>
        )}
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
        <ImagesField name="images" initial={v.images} max={8} onUploadingChange={setUploading} />
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
      <div className="adm-f">
        <label className="adm-check">
          <input type="checkbox" role="switch" name="is_diy" defaultChecked={v.is_diy} aria-describedby="is_diy-hint" />
          منتج اصنعها بنفسك
        </label>
        <span className="adm-hint" id="is_diy-hint">بيظهر كأول كارت في القسم برسمة بدل الصورة (لو مفيش صور)، ومن غير اختيار &quot;زي ما هو&quot;: العميل يكتب اسمه أو يرفع تصميمه بس.</span>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="adm-btn" type="submit" disabled={pending || uploading}>{pending ? "جاري الحفظ…" : "حفظ"}</button>
        {state.message && <span className={state.ok ? "adm-ok" : "adm-err"} role="status">{state.message}</span>}
      </div>
    </form>
  );
}
