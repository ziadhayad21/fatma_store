"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { saveProduct, type SaveState } from "@/app/actions/admin-catalog";
import { DiyIllustration, diyKind } from "@/components/shop/DiyIllustration";
import { PriceDisplay } from "@/components/shop/PriceDisplay";
import { catalogSlug } from "@/lib/admin/slug";
import { parseMoney } from "@/lib/admin/validate";
import { DEFAULT_PIECE_LABELS, PIECE_LABEL_MAX } from "@/lib/couples";
import { productPrice, validDiscountPercent } from "@/lib/pricing/discount";
import type { ProductImage } from "@/lib/types";
import { ProductImagesField } from "./ProductImagesField";

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

export type CategoryOption = { id: string; slug: string; name_ar: string; has_colors: boolean; allows_couples: boolean };

type ProductType = "normal" | "couples" | "diy";
const TYPE_HINT: Record<ProductType, string> = {
  normal: "منتج عادي: العميل يطلبه زي ما هو، أو باسمه، أو بتصميمه.",
  couples: "قطعتين في منتج واحد: العميل يختار لون واسم أو تصميم لكل قطعة، والسعر ثابت للقطعتين.",
  diy: "بيظهر كأول كارت في القسم برسمة بدل الصورة (لو مفيش صور)، والعميل لازم يكتب اسمه أو يرفع تصميمه.",
};
const IMAGES_MAX = 8;

/**
 * Add / edit product. Same fields and saving logic as before (saveProduct); only the layout changed:
 * cards in a main column, status / order / live preview in a sticky side column, a sticky save bar,
 * inline errors and a toast after saving.
 */
export function ProductForm({
  values: v,
  categories,
  notice,
}: {
  values: ProductFormValues;
  categories: CategoryOption[];
  /** one-off toast on arrival (e.g. right after the product was created) */
  notice?: string;
}) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const isNew = v.id === "new";

  // ---------------------------------------------------------------- state
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState(notice ?? "");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  };
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (prev, fd) => {
    const res = await saveProduct(prev, fd); // a new product redirects to its edit page from here
    if (res.ok) {
      setDirty(false);
      showToast(res.message);
    }
    return res;
  }, { ok: false, message: "" });
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState(v.name_ar);
  const [slugOpen, setSlugOpen] = useState(false);
  const [slugInput, setSlugInput] = useState("");
  const [categoryId, setCategoryId] = useState(v.category_id);
  const [type, setType] = useState<ProductType>(v.is_couples ? "couples" : v.is_diy ? "diy" : "normal");
  const [typeNotice, setTypeNotice] = useState("");
  const [regularPrice, setRegularPrice] = useState(v.base_price);
  const [colors, setColors] = useState(v.colors);
  const [discountEnabled, setDiscountEnabled] = useState(v.discount_percent !== "");
  const [discount, setDiscount] = useState(v.discount_percent);
  const [images, setImages] = useState(v.images);
  const [active, setActive] = useState(v.is_active);

  const category = categories.find((c) => c.id === categoryId);
  const hasColors = category?.has_colors ?? false;
  const allowsCouples = category?.allows_couples ?? false;
  const couples = type === "couples";
  const perColorPrices = hasColors && !couples;
  const markDirty = () => setDirty(true);

  // first visit of the page: fade the arrival toast out
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  // leaving with unsaved changes asks first
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const patchColor = (id: string, patch: Partial<ProductColorValue>) =>
    setColors((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  function changeCategory(id: string) {
    setCategoryId(id);
    const next = categories.find((c) => c.id === id);
    if (type === "couples" && !next?.allows_couples) {
      setType("normal");
      setTypeNotice(`قسم «${next?.name_ar ?? ""}» مش بيسمح بمنتجات كابلز، فالمنتج اتحوّل لمنتج عادي.`);
    } else setTypeNotice("");
  }

  // ---------------------------------------------------------------- live preview
  const available = colors.filter((c) => c.available);
  const colorPrices = available.map((c) => parseMoney(c.price)).filter((n): n is number => typeof n === "number");
  const previewBase = perColorPrices ? (colorPrices.length ? Math.min(...colorPrices) : null) : parseMoney(regularPrice);
  const parsedDiscount = parseMoney(discount, 100);
  const discountOk = typeof parsedDiscount === "number" && validDiscountPercent(parsedDiscount);
  const preview = typeof previewBase === "number"
    ? productPrice({ base_price: previewBase, discount_percent: discountEnabled && discountOk ? (parsedDiscount as number) : null })
    : null;
  const previewFrom = perColorPrices && new Set(colorPrices).size > 1;
  const slugPreview = v.slug || (slugOpen && slugInput.trim() ? catalogSlug(slugInput, "product") : name.trim() ? catalogSlug(name, "product") : "");

  // ---------------------------------------------------------------- validation (the server checks again)
  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name_ar = "اكتب اسم المنتج.";
    if (!categoryId) e.category_id = "اختار القسم.";
    if (perColorPrices) {
      for (const c of available) {
        const p = parseMoney(c.price);
        if (p === null || p === "blank") e[`color_${c.id}`] = "اكتب سعر اللون ده.";
      }
      if (available.length === 0) e.colors = "فعّل لون واحد على الأقل واكتب سعره.";
    } else {
      const p = parseMoney(regularPrice);
      if (p === null || p === "blank") e.base_price = couples ? "اكتب سعر الكابلز." : "اكتب السعر.";
      if (couples && hasColors && available.length === 0) e.colors = "فعّل لون واحد على الأقل.";
    }
    if (discountEnabled && !discountOk) e.discount_percent = "اكتب نسبة خصم أكبر من ٠ وأقل من ١٠٠.";
    return e;
  }
  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    if (uploading) {
      ev.preventDefault();
      return;
    }
    const e = validate();
    setClientErrors(e);
    if (Object.keys(e).length) {
      ev.preventDefault();
      const first = Object.keys(e)[0];
      const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector<HTMLElement>("input, select, textarea, button")?.focus({ preventScroll: true });
    }
  }

  const errors: Record<string, string> = { ...(state.ok ? {} : state.fieldErrors ?? {}), ...clientErrors };
  const err = (k: string) => (errors[k] ? <span className="adm-err" role="alert">{errors[k]}</span> : null);
  const errorCount = Object.keys(errors).length;
  const previewImg = images[0];

  return (
    <form
      ref={formRef}
      action={formAction}
      className="adm-pf"
      noValidate
      onSubmit={onSubmit}
      onInput={markDirty}
      onChange={markDirty}
    >
      <input type="hidden" name="id" value={v.id} />
      {couples && <input type="hidden" name="is_couples" value="on" />}
      {type === "diy" && <input type="hidden" name="is_diy" value="on" />}

      <div className="adm-pf-grid">
        <div className="adm-pf-main">
          {/* ------------------------------------------------ 1. basics */}
          <section className="adm-card adm-pf-card" aria-labelledby={`${uid}-basics`}>
            <h2 id={`${uid}-basics`}>المعلومات الأساسية</h2>
            <div className="adm-f" data-field="name_ar">
              <label htmlFor="name_ar">اسم المنتج</label>
              <input id="name_ar" name="name_ar" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} aria-invalid={!!errors.name_ar} placeholder="مثلاً: مريلة مطبخ Chef" />
              {err("name_ar")}
              <div className="adm-slug">
                <span>رابط المنتج: <bdi dir="ltr">/products/{slugPreview || "…"}</bdi></span>
                {isNew ? (
                  !slugOpen && (
                    <button type="button" className="adm-link" onClick={() => { setSlugOpen(true); setSlugInput(slugPreview); }}>
                      تعديل
                    </button>
                  )
                ) : (
                  <span className="adm-hint">(ثابت بعد الإنشاء)</span>
                )}
              </div>
              {isNew && slugOpen && (
                <div className="adm-slug-edit" data-field="slug">
                  <input name="slug" type="text" dir="ltr" value={slugInput} onChange={(e) => setSlugInput(e.target.value)} maxLength={80} aria-label="رابط المنتج" aria-invalid={!!errors.slug} />
                  <span className="adm-hint">حروف إنجليزي صغيرة وأرقام وشرطة (-). لو مستخدم هنضيف له رقم.</span>
                  {err("slug")}
                </div>
              )}
            </div>
            <div className="adm-f" data-field="category_id">
              <label htmlFor="category_id">القسم</label>
              <select id="category_id" name="category_id" value={categoryId} onChange={(e) => changeCategory(e.target.value)} aria-invalid={!!errors.category_id}>
                <option value="" disabled>اختار القسم</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
              </select>
              {err("category_id")}
            </div>
          </section>

          {/* ------------------------------------------------ 2. type */}
          <section className="adm-card adm-pf-card" aria-labelledby={`${uid}-type`} data-field="product_type">
            <h2 id={`${uid}-type`}>نوع المنتج</h2>
            <div className="adm-seg" role="radiogroup" aria-labelledby={`${uid}-type`}>
              {(["normal", ...(allowsCouples ? ["couples"] : []), "diy"] as ProductType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  className={type === t ? "on" : ""}
                  onClick={() => {
                    setType(t);
                    setTypeNotice("");
                    markDirty();
                  }}
                >
                  {t === "normal" ? "عادي" : t === "couples" ? "كابلز" : "اصنعها بنفسك"}
                </button>
              ))}
            </div>
            <p className="adm-hint adm-pf-lead">{TYPE_HINT[type]}</p>
            {typeNotice && <p className="adm-pf-notice" role="status">{typeNotice}</p>}
            {err("product_type")}
            {couples && (
              <div className="adm-row">
                {[0, 1].map((i) => (
                  <div className="adm-f" key={i} data-field={`piece_label_${i + 1}`}>
                    <label htmlFor={`piece_label_${i + 1}`}>اسم القطعة {i === 0 ? "الأولى" : "التانية"}</label>
                    <input id={`piece_label_${i + 1}`} name={`piece_label_${i + 1}`} type="text" defaultValue={v.piece_labels[i]} placeholder={DEFAULT_PIECE_LABELS[i]} maxLength={PIECE_LABEL_MAX} aria-invalid={!!errors[`piece_label_${i + 1}`]} />
                    {err(`piece_label_${i + 1}`)}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ------------------------------------------------ 3. price */}
          <section className="adm-card adm-pf-card" aria-labelledby={`${uid}-price`}>
            <h2 id={`${uid}-price`}>السعر</h2>

            {perColorPrices ? (
              <div data-field="colors">
                <p className="adm-hint adm-pf-lead">فعّل الألوان المتاحة واكتب سعر كل لون. السعر واحد مهما كانت طريقة الطلب.</p>
                {colors.length === 0 ? (
                  <span className="adm-err" role="alert">مفيش ألوان مفعّلة في قاعدة البيانات.</span>
                ) : (
                  <table className="adm-ctable">
                    <thead>
                      <tr>
                        <th scope="col">اللون</th>
                        <th scope="col">متاح</th>
                        <th scope="col">السعر (ج.م)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {colors.map((c) => (
                        <tr key={c.id} data-off={!c.available || undefined} data-field={`color_${c.id}`}>
                          <th scope="row">
                            <span className="adm-swatch" style={{ background: c.hex }} aria-hidden="true" />
                            {c.name_ar}
                          </th>
                          <td>
                            <label className="adm-switch">
                              <input type="checkbox" role="switch" name={`color_available_${c.id}`} checked={c.available} onChange={(e) => patchColor(c.id, { available: e.target.checked })} aria-label={`${c.name_ar} متاح`} />
                              <span aria-hidden="true" />
                            </label>
                          </td>
                          <td>
                            <div className="adm-money">
                              <input type="text" inputMode="decimal" dir="ltr" name={`color_price_${c.id}`} value={c.price} onChange={(e) => patchColor(c.id, { price: e.target.value })} placeholder="0" aria-label={`سعر اللون ${c.name_ar}`} aria-invalid={!!errors[`color_${c.id}`]} />
                            </div>
                            {err(`color_${c.id}`)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {err("colors")}
              </div>
            ) : (
              <div className="adm-f adm-pf-price" data-field="base_price">
                <label htmlFor="base_price">{couples ? "سعر الكابلز (ج.م)" : "السعر (ج.م)"}</label>
                <div className="adm-money">
                  <input id="base_price" name="base_price" type="text" inputMode="decimal" dir="ltr" value={regularPrice} onChange={(e) => setRegularPrice(e.target.value)} placeholder="0" aria-invalid={!!errors.base_price} />
                </div>
                <span className="adm-hint">{couples ? "سعر واحد للقطعتين، مهما كانت الألوان أو طريقة الطلب." : "السعر واحد مهما كانت طريقة الطلب."}</span>
                {err("base_price")}
              </div>
            )}

            {couples && hasColors && (
              <fieldset className="adm-f adm-pf-chips" data-field="colors">
                <legend className="lbl">الألوان المتاحة لكل قطعة</legend>
                <div className="adm-chips">
                  {colors.map((c) => (
                    <label key={c.id} className="adm-chip">
                      <input type="checkbox" name={`color_available_${c.id}`} checked={c.available} onChange={(e) => patchColor(c.id, { available: e.target.checked })} />
                      <span className="adm-swatch" style={{ background: c.hex }} aria-hidden="true" />
                      {c.name_ar}
                    </label>
                  ))}
                </div>
                {err("colors")}
              </fieldset>
            )}

            <div className="adm-pf-discount" data-field="discount_percent">
              <label className="adm-switch-row">
                <span className="adm-switch">
                  <input type="checkbox" role="switch" name="discount_enabled" checked={discountEnabled} onChange={(e) => setDiscountEnabled(e.target.checked)} />
                  <span aria-hidden="true" />
                </span>
                خصم
              </label>
              {discountEnabled && (
                <div className="adm-pf-discount-fields">
                  <div className="adm-f">
                    <label htmlFor="discount_percent">نسبة الخصم</label>
                    <div className="adm-money adm-pct">
                      <input id="discount_percent" name="discount_percent" type="text" inputMode="decimal" dir="ltr" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="10" aria-invalid={!!errors.discount_percent} />
                    </div>
                    {err("discount_percent")}
                  </div>
                  <div className="adm-f" aria-live="polite">
                    <span className="lbl">السعر بعد الخصم{perColorPrices ? " (أقل لون)" : ""}</span>
                    {preview && discountOk ? <PriceDisplay {...preview} /> : <span className="adm-hint">اكتب السعر ونسبة خصم صحيحة.</span>}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ------------------------------------------------ 4. images */}
          <section className="adm-card adm-pf-card" aria-labelledby={`${uid}-images`} data-field="images">
            <h2 id={`${uid}-images`}>الصور</h2>
            <p className="adm-hint adm-pf-lead">اسحب الصور لترتيبها. الأولى هي الرئيسية، والتانية بتظهر لما الماوس يعدّي على الكارت.</p>
            <ProductImagesField
              name="images"
              initial={v.images}
              max={IMAGES_MAX}
              onUploadingChange={setUploading}
              onChange={(list) => {
                setImages(list);
                markDirty();
              }}
            />
            {err("images")}
          </section>

          {/* ------------------------------------------------ 5. description */}
          <section className="adm-card adm-pf-card" aria-labelledby={`${uid}-desc`}>
            <h2 id={`${uid}-desc`}>الوصف</h2>
            <div className="adm-f" data-field="description_ar">
              <label htmlFor="description_ar">وصف المنتج</label>
              <textarea id="description_ar" name="description_ar" defaultValue={v.description_ar} maxLength={4000} rows={4} placeholder="سطرين عن المنتج بيظهروا تحت السعر." />
              {err("description_ar")}
            </div>
            <details className="adm-pf-more" open={!!(v.details_ar || v.care_ar) || undefined}>
              <summary>تفاصيل إضافية</summary>
              <div className="adm-pf-more-body">
                <div className="adm-f">
                  <label htmlFor="details_ar">تفاصيل المنتج</label>
                  <textarea id="details_ar" name="details_ar" defaultValue={v.details_ar} maxLength={4000} rows={3} placeholder="الخامة، المقاس…" />
                </div>
                <div className="adm-f">
                  <label htmlFor="care_ar">العناية بالقماش</label>
                  <textarea id="care_ar" name="care_ar" defaultValue={v.care_ar} maxLength={4000} rows={3} placeholder="الغسيل والكي…" />
                </div>
              </div>
            </details>
          </section>
        </div>

        {/* ------------------------------------------------ side */}
        <aside className="adm-pf-side">
          <section className="adm-card adm-pf-card" aria-labelledby={`${uid}-status`}>
            <h2 id={`${uid}-status`}>الحالة</h2>
            <label className="adm-switch-row">
              <span className="adm-switch">
                <input type="checkbox" role="switch" name="is_active" checked={active} onChange={(e) => setActive(e.target.checked)} />
                <span aria-hidden="true" />
              </span>
              ظاهر على الموقع
            </label>
            <p className="adm-hint">{active ? "العملاء يقدروا يشوفوه ويطلبوه." : "مخفي: محدش يشوفه غيرك."}</p>
          </section>

          <section className="adm-card adm-pf-card" aria-labelledby={`${uid}-sort`} data-field="sort">
            <h2 id={`${uid}-sort`}>الترتيب</h2>
            <input id="sort" name="sort" type="number" step={1} inputMode="numeric" defaultValue={v.sort} dir="ltr" className="adm-pf-sort" aria-labelledby={`${uid}-sort`} aria-describedby={`${uid}-sort-hint`} aria-invalid={!!errors.sort} />
            <p className="adm-hint" id={`${uid}-sort-hint`}>الأصغر بيظهر الأول.</p>
            {err("sort")}
          </section>

          <section className="adm-card adm-pf-card" aria-labelledby={`${uid}-preview`}>
            <h2 id={`${uid}-preview`}>معاينة</h2>
            <div className="adm-pv">
              <div className="adm-pv-img" data-diy={!previewImg && type === "diy" ? "" : undefined}>
                {previewImg ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin preview of arbitrary public URLs
                  <img src={previewImg.src} alt="" style={{ objectPosition: previewImg.position }} />
                ) : type === "diy" ? (
                  <DiyIllustration kind={diyKind(category?.slug ?? "")} />
                ) : (
                  <span className="adm-hint">مفيش صورة لسه</span>
                )}
                {!active && <span className="adm-pv-hidden">مخفي</span>}
              </div>
              <div className="adm-pv-tags">
                {couples && <span className="adm-pv-tag">كابلز</span>}
                {type === "diy" && <span className="adm-pv-tag">اصنعها بنفسك</span>}
              </div>
              <strong className="adm-pv-name" dir="auto">{name.trim() || "اسم المنتج"}</strong>
              <span className="adm-pv-price">{preview ? <PriceDisplay {...preview} from={previewFrom} /> : <span className="adm-hint">السعر</span>}</span>
              {category && <span className="adm-hint">{category.name_ar}</span>}
            </div>
          </section>
        </aside>
      </div>

      {/* ------------------------------------------------ sticky save bar */}
      <div className="adm-pf-bar">
        <div className="adm-pf-bar-status" aria-live="polite">
          {errorCount > 0 ? (
            <span className="adm-err">{state.message && !state.ok ? state.message : "راجع الحقول المعلّمة."}</span>
          ) : !state.ok && state.message ? (
            <span className="adm-err">{state.message}</span>
          ) : dirty ? (
            <span className="adm-pf-dirty">في تغييرات مش محفوظة</span>
          ) : null}
        </div>
        <Link
          href="/admin/products"
          className="adm-btn ghost"
          onClick={(e) => {
            if (dirty && !window.confirm("في تغييرات مش محفوظة. تخرج من غير حفظ؟")) e.preventDefault();
          }}
        >
          إلغاء
        </Link>
        <button className="adm-btn primary" type="submit" disabled={pending || uploading}>
          {pending ? "جاري الحفظ…" : uploading ? "استنى الرفع…" : "حفظ"}
        </button>
      </div>

      {toast && (
        <div className="adm-toast" role="status">
          {toast}
        </div>
      )}
    </form>
  );
}
