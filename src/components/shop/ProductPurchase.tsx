"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { Button } from "@/components/ui/Button";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { designInUse } from "@/lib/cart-actions";
import { isCouples } from "@/lib/couples";
import { productRules, type ProductColor } from "@/lib/product-rules";
import { normalizeName, validateName } from "@/lib/personalization";
import { findColor, productPrice } from "@/lib/pricing/discount";
import type { FontId, OrderMode, Product } from "@/lib/types";
import { designUploader } from "@/lib/upload";
import { useCart, type CartLine } from "@/store/cart";
import { useUI } from "@/store/ui";
import { CouplesForm } from "./CouplesPurchase";
import { DesignPanel, type DesignState } from "./DesignPanel";
import { isLight } from "./swatch";
import { NamePanel } from "./NamePanel";
import { PriceDisplay } from "./PriceDisplay";

// One price whatever the option: none of them adds a printing cost.
const WAYS: { id: OrderMode; title: string; sub: string }[] = [
  { id: "standard", title: "زي ما هو", sub: "المنتج بتصميمه الأصلي" },
  { id: "name", title: "اكتب اسمك عليه", sub: "اسم أو كلمة بالخط اللي يعجبك" },
  { id: "design", title: "ارفع تصميمك", sub: "لوجو، رسمة أو صورة" },
];


/**
 * `?edit=<cart line key>` (from the cart's "عدّل") opens this page pre-filled with that line;
 * saving writes the changes back to the same line instead of adding a new one.
 */
export function ProductPurchase({ product }: { product: Product }) {
  return (
    <Suspense fallback={isCouples(product) ? <CouplesForm product={product} initial={null} /> : <PurchaseForm product={product} initial={null} />}>
      <EditAware product={product} />
    </Suspense>
  );
}

function EditAware({ product }: { product: Product }) {
  const editKey = useSearchParams().get("edit");
  const line = useCart((s) => (editKey ? s.lines.find((l) => l.key === editKey && l.productId === product.slug) : undefined));
  // the key remounts the form when the cart line (re)hydrates from localStorage
  if (isCouples(product)) return <CouplesForm key={line?.key ?? "new"} product={product} initial={line ?? null} />;
  return <PurchaseForm key={line?.key ?? "new"} product={product} initial={line ?? null} />;
}

function PurchaseForm({ product: p, initial }: { product: Product; initial: CartLine | null }) {
  const router = useRouter();
  const editing = initial !== null;
  const rules = productRules(p);
  // the line's colour when editing (if still sold), otherwise the first available colour
  const [color, setColor] = useState<ProductColor | null>(
    findColor(p, initial?.color)?.id ?? p.colors[0]?.id ?? null,
  );
  const noColors = rules.colors && p.colors.length === 0;
  const lineColor = rules.colors ? color : null;
  // DIY products have no "as is" option: "ارفع تصميمك" is preselected
  const defaultMode: OrderMode = rules.standard ? "standard" : "design";
  const [mode, setMode] = useState<OrderMode>(
    rules.customization && initial?.mode && (rules.standard || initial.mode !== "standard") ? initial.mode : rules.customization ? defaultMode : "standard",
  );
  const ways = rules.standard ? WAYS : WAYS.filter((w) => w.id !== "standard");
  const [qty, setQty] = useState(initial?.qty ?? 1);
  const [name, setName] = useState(initial?.text ?? "");
  const [font, setFont] = useState<FontId>(initial?.font ?? "ruqaa");
  const [customizationNotes, setCustomizationNotes] = useState(initial?.notes ?? "");
  const [design, setDesign] = useState<DesignState>(
    initial?.designPath
      ? { status: "done", name: initial.designName ?? "تصميم", path: initial.designPath, previewUrl: null }
      : { status: "idle" },
  );
  const add = useCart((s) => s.add);
  const replace = useCart((s) => s.replace);
  const openCart = useUI((s) => s.openCart);

  // Add-to-cart stays disabled until the chosen option is complete.
  const cantAdd = noColors || (mode === "name" && !validateName(name).ok) || (mode === "design" && design.status !== "done");
  const cantAddMsg = noColors
    ? "المنتج ده مش متاح دلوقتي."
    : mode === "name"
      ? "اكتب الاسم الأول عشان تقدر تضيفه للسلة."
      : design.status === "uploading"
        ? "استنى لحد ما التصميم يخلّص رفع."
        : "ارفع التصميم الأول عشان تقدر تضيفه للسلة.";

  function buildLine() {
    const cleanNotes = (mode === "name" || mode === "design") && customizationNotes.trim() ? customizationNotes.trim() : null;
    if (mode === "name") {
      return { productId: p.slug, mode, text: normalizeName(name), font: rules.font ? font : null, color: lineColor, designPath: null, designName: null, notes: cleanNotes, qty } as const;
    }
    if (mode === "design" && design.status === "done") {
      return { productId: p.slug, mode, text: null, font: null, designPath: design.path, designName: design.name, color: lineColor, notes: cleanNotes, qty } as const;
    }
    return { productId: p.slug, mode: "standard", text: null, font: null, designPath: null, designName: null, color: lineColor, notes: null, qty } as const;
  }

  function submit() {
    const line = buildLine();
    if (initial) {
      replace(initial.key, line);
      // the edit dropped/replaced the old file: delete it unless another line still uses it
      if (initial.designPath && line.designPath !== initial.designPath && !designInUse(initial.designPath)) {
        void designUploader.remove(initial.designPath).catch(() => {});
      }
      router.push("/cart");
    } else {
      add(line);
      openCart();
    }
  }

  return (
    <div className="info">
      <div className="rise d1" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Link href={`/collections/${p.category_slug}`} className="eyebrow" style={{ textDecoration: "none" }}>
          {p.category_name}
        </Link>
        <h1 style={{ fontSize: 34, lineHeight: 1.25 }}>{p.name_ar}</h1>
        <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 12 }} aria-live="polite">
          <PriceDisplay {...productPrice(p, { color: lineColor })} style={{ fontSize: 20 }} />
        </div>
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 15 }}>{p.description_ar}</p>
      </div>

      {editing && (
        <div className="edit-note" role="status">
          <span>بتعدّل المنتج ده في السلة.</span>
          <Link href="/cart" className="rm">إلغاء</Link>
        </div>
      )}

      {rules.customization && <div className="rise d2" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="lbl" id="way">طريقة الطلب</span>
        <div role="group" aria-labelledby="way" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ways.map((w) => {
            const on = mode === w.id;
            return (
              <div key={w.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button type="button" className={`opt${on ? " on" : ""}`} aria-pressed={on} onClick={() => setMode(w.id)}>
                  <span className="rd" aria-hidden="true"><i /></span>
                  <span style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{w.title}</span>
                    <span className="muted" style={{ fontSize: 13 }}>{!rules.font && w.id === "name" ? "اسم أو كلمة باللون اللي يعجبك" : w.sub}</span>
                  </span>
                </button>

                {on && w.id === "name" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <NamePanel name={name} font={font} onName={setName} onFont={setFont} hideFont={!rules.font} />
                    <div className="panel" style={{ marginTop: 0 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <label htmlFor="customization-notes-name" className="lbl">
                          <span>ملاحظات التخصيص (اختياري)</span>
                          <span className="muted" aria-live="polite">{[...customizationNotes].length}/500</span>
                        </label>
                        <textarea
                          id="customization-notes-name"
                          className="inp"
                          style={{
                            width: "100%",
                            minHeight: 76,
                            height: "auto",
                            padding: "10px 14px",
                            resize: "vertical",
                            fontSize: 14,
                            lineHeight: 1.5,
                            borderRadius: 0,
                          }}
                          maxLength={500}
                          placeholder="مثلاً: صغّر حجم الاسم، أو ضع التصميم في موضع محدد، أو أي تعليمات خاصة."
                          value={customizationNotes}
                          onChange={(e) => setCustomizationNotes(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {on && w.id === "design" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <DesignPanel value={design} onChange={setDesign} />
                    <div className="panel" style={{ marginTop: 0 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <label htmlFor="customization-notes-design" className="lbl">
                          <span>ملاحظات التخصيص (اختياري)</span>
                          <span className="muted" aria-live="polite">{[...customizationNotes].length}/500</span>
                        </label>
                        <textarea
                          id="customization-notes-design"
                          className="inp"
                          style={{
                            width: "100%",
                            minHeight: 76,
                            height: "auto",
                            padding: "10px 14px",
                            resize: "vertical",
                            fontSize: 14,
                            lineHeight: 1.5,
                            borderRadius: 0,
                          }}
                          maxLength={500}
                          placeholder="مثلاً: صغّر حجم الاسم، أو ضع التصميم في موضع محدد، أو أي تعليمات خاصة."
                          value={customizationNotes}
                          onChange={(e) => setCustomizationNotes(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>}

      {rules.colors && p.colors.length > 0 && (
        <div className="panel">
          <span className="lbl" id="color-l">اللون</span>
          <div className="color-swatches" role="group" aria-labelledby="color-l">
            {p.colors.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`color-swatch${isLight(c.hex) ? " color-swatch--light" : ""}${color === c.id ? " on" : ""}`}
                style={{ background: c.hex }}
                aria-pressed={color === c.id}
                aria-label={c.name_ar}
                title={c.name_ar}
                onClick={() => setColor(c.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="rise d3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <QtyStepper large value={qty} onChange={setQty} />
          <Button block disabled={cantAdd} onClick={submit}>
            {editing ? "حفظ التعديلات" : "أضف للسلة"}
          </Button>
        </div>
        {cantAdd && <span className="muted" style={{ fontSize: 13 }}>{cantAddMsg}</span>}
      </div>

      <div className="rise d4">
        <Accordion
          defaultOpen={null}
          items={[
            { title: "تفاصيل المنتج", body: p.details_ar },
            { title: "العناية بالقماش", body: p.care_ar },
            { title: "الشحن والاسترجاع", body: "هنا هتتضاف مدة التجهيز والتوصيل وسياسة الاسترجاع." },
          ]}
        />
      </div>
    </div>
  );
}
