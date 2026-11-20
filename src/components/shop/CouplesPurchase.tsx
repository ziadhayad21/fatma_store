"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { designInUse } from "@/lib/cart-actions";
import { lineDesignPaths, pieceLabels, type LinePiece } from "@/lib/couples";
import { fontCss, nameFonts } from "@/lib/name-fonts";
import { NAME_MAX, normalizeName, validateName } from "@/lib/personalization";
import { productRules } from "@/lib/product-rules";
import { findColor, productPrice } from "@/lib/pricing/discount";
import type { FontId, OrderMode, Product } from "@/lib/types";
import { designUploader } from "@/lib/upload";
import { useCart, type CartLine } from "@/store/cart";
import { useUI } from "@/store/ui";
import { DesignPanel, type DesignState } from "./DesignPanel";
import { PriceDisplay } from "./PriceDisplay";
import { ProductInfo } from "./ProductInfo";
import { isLight } from "./swatch";

// Same three options, worded for two. None of them changes the price.
const WAYS: { id: OrderMode; title: string; sub: string }[] = [
  { id: "standard", title: "زي ما هم", sub: "المنتج بتصميمه الأصلي، لكل قطعة لونها" },
  { id: "name", title: "بأساميكم", sub: "اسم على كل قطعة، بنفس الخط" },
  { id: "design", title: "بتصميمكم", sub: "تصميم لكل قطعة: لوجو، رسمة أو صورة" },
];

type PieceState = { color: string | null; name: string; design: DesignState };

const fromLine = (p: LinePiece | undefined, fallbackColor: string | null): PieceState => ({
  color: p?.color ?? fallbackColor,
  name: p?.text ?? "",
  design: p?.designPath ? { status: "done", name: p.designName ?? "تصميم", path: p.designPath, previewUrl: null } : { status: "idle" },
});

/**
 * "كابلز" product: one product, two pieces configured side by side. One fixed price for the pair
 * (colours never change it), one shared font, one shared notes field. Editing a cart line works as for
 * normal products (`initial`).
 */
export function CouplesForm({ product: p, initial }: { product: Product; initial: CartLine | null }) {
  const router = useRouter();
  const uid = useId();
  const editing = initial !== null;
  const rules = productRules(p);
  const labels = pieceLabels(p);
  const firstColor = rules.colors ? (p.colors[0]?.id ?? null) : null;
  const validColor = (c: string | null | undefined) => (rules.colors ? (findColor(p, c)?.id ?? firstColor) : null);

  const defaultMode: OrderMode = rules.standard ? "standard" : "design";
  const [mode, setMode] = useState<OrderMode>(
    initial?.mode && rules.customization && (rules.standard || initial.mode !== "standard") ? initial.mode : rules.customization ? defaultMode : "standard",
  );
  const [pieces, setPieces] = useState<PieceState[]>(() =>
    labels.map((_, i) => {
      const s = fromLine(initial?.pieces?.[i], firstColor);
      return { ...s, color: validColor(s.color) };
    }),
  );
  // on by default; a saved line with two different colours opens with it off
  const [sameColor, setSameColor] = useState(() => new Set(pieces.map((x) => x.color)).size <= 1);
  const [font, setFont] = useState<FontId>(initial?.font ?? "ruqaa");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [qty, setQty] = useState(initial?.qty ?? 1);
  const add = useCart((s) => s.add);
  const replace = useCart((s) => s.replace);
  const openCart = useUI((s) => s.openCart);

  const patch = (i: number, v: Partial<PieceState>) => setPieces((list) => list.map((x, k) => (k === i ? { ...x, ...v } : x)));
  const pickColor = (i: number, color: string) =>
    setPieces((list) => list.map((x, k) => (sameColor || k === i ? { ...x, color } : x)));
  const toggleSame = (on: boolean) => {
    setSameColor(on);
    if (on) setPieces((list) => list.map((x) => ({ ...x, color: list[0].color }))); // both follow the first piece
  };

  // what is still missing before the pair can go to the cart
  const noColors = rules.colors && p.colors.length === 0;
  const missing: string[] = [];
  if (mode === "name") pieces.forEach((x, i) => !validateName(x.name).ok && missing.push(`اسم ${labels[i]}`));
  if (mode === "design") pieces.forEach((x, i) => x.design.status === "idle" && missing.push(`تصميم ${labels[i]}`));
  const uploading = mode === "design" && pieces.some((x) => x.design.status === "uploading");
  const badName = mode === "name" ? pieces.find((x) => x.name.trim() && !validateName(x.name).ok) : undefined;
  const cantAdd = noColors || missing.length > 0 || uploading;
  const cantAddMsg = noColors
    ? "المنتج ده مش متاح دلوقتي."
    : uploading
      ? "استنى لحد ما التصميم يخلّص رفع."
      : badName
        ? (validateName(badName.name) as { error: string }).error
        : `ناقص: ${missing.join(" و")}.`;

  function buildLine() {
    const linePieces: LinePiece[] = pieces.map((x) => ({
      color: rules.colors ? x.color : null,
      text: mode === "name" ? normalizeName(x.name) : null,
      designPath: mode === "design" && x.design.status === "done" ? x.design.path : null,
      designName: mode === "design" && x.design.status === "done" ? x.design.name : null,
    }));
    return {
      productId: p.slug,
      mode,
      text: null,
      font: mode === "name" ? font : null,
      designPath: null,
      designName: null,
      color: linePieces[0].color,
      notes: mode !== "standard" && notes.trim() ? notes.trim() : null,
      pieces: linePieces,
      qty,
    } as const;
  }

  function submit() {
    const line = buildLine();
    if (initial) {
      replace(initial.key, line);
      // designs the edit dropped: delete them unless another cart line still uses them
      const kept = new Set(lineDesignPaths(line));
      for (const path of lineDesignPaths(initial)) {
        if (!kept.has(path) && !designInUse(path)) void designUploader.remove(path).catch(() => {});
      }
      router.push("/cart");
    } else {
      add(line);
      openCart();
    }
  }

  const sample = pieces.map((x) => x.name.trim()).find(Boolean) || "فاطمة";

  return (
    <div className="info">
      <div className="rise d1" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Link href={`/collections/${p.category_slug}`} className="eyebrow" style={{ textDecoration: "none" }}>
          {p.category_name}
        </Link>
        <h1 style={{ fontSize: 34, lineHeight: 1.25 }}>{p.name_ar}</h1>
        <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <PriceDisplay {...productPrice(p)} style={{ fontSize: 20 }} />
          <span className="cpl-tag">كابلز · سعر القطعتين</span>
        </div>
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 15 }}>{p.description_ar}</p>
      </div>

      {editing && (
        <div className="edit-note" role="status">
          <span>بتعدّل المنتج ده في السلة.</span>
          <Link href="/cart" className="rm">إلغاء</Link>
        </div>
      )}

      {rules.customization && (
        <div className="rise d2" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="lbl" id={`${uid}-way`}>طريقة الطلب</span>
          <div role="group" aria-labelledby={`${uid}-way`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {WAYS.filter((w) => rules.standard || w.id !== "standard").map((w) => {
              const on = mode === w.id;
              return (
                <button key={w.id} type="button" className={`opt${on ? " on" : ""}`} aria-pressed={on} onClick={() => setMode(w.id)}>
                  <span className="rd" aria-hidden="true"><i /></span>
                  <span style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{w.title}</span>
                    <span className="muted" style={{ fontSize: 13 }}>{w.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="cpl rise d2">
        {rules.colors && p.colors.length > 1 && (
          <label className="cpl-same">
            <input type="checkbox" checked={sameColor} onChange={(e) => toggleSame(e.target.checked)} />
            نفس اللون للاتنين
          </label>
        )}
        <div className="cpl-pieces">
          {pieces.map((x, i) => {
            const headId = `${uid}-p${i}`;
            const nameErr = mode === "name" && x.name.trim() && !validateName(x.name).ok ? (validateName(x.name) as { error: string }).error : "";
            return (
              <section key={i} className="cpl-piece" aria-labelledby={headId}>
                <h2 className="cpl-piece-title" id={headId}>
                  {labels[i]}
                  {rules.colors && x.color && <span className="muted"> · {findColor(p, x.color)?.name_ar}</span>}
                </h2>

                {rules.colors && p.colors.length > 0 && (
                  <div className="color-swatches" role="group" aria-label={`لون ${labels[i]}`}>
                    {p.colors.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`color-swatch${isLight(c.hex) ? " color-swatch--light" : ""}${x.color === c.id ? " on" : ""}`}
                        style={{ background: c.hex }}
                        aria-pressed={x.color === c.id}
                        aria-label={`${c.name_ar} — ${labels[i]}`}
                        title={c.name_ar}
                        onClick={() => pickColor(i, c.id)}
                      />
                    ))}
                  </div>
                )}

                {mode === "name" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label htmlFor={`${headId}-n`} className="lbl">
                      <span>الاسم</span>
                      <span className="muted" aria-live="polite">{[...x.name].length}/{NAME_MAX}</span>
                    </label>
                    <input
                      id={`${headId}-n`}
                      className="inp"
                      type="text"
                      autoComplete="off"
                      placeholder={i === 0 ? "مثلاً: Beso kitchen" : "مثلاً: فاطمة"}
                      value={x.name}
                      onChange={(e) => patch(i, { name: [...e.target.value].slice(0, NAME_MAX).join("") })}
                      aria-invalid={nameErr ? true : undefined}
                      aria-describedby={nameErr ? `${headId}-e` : undefined}
                      style={{ width: "100%", flex: "none" }}
                    />
                    {nameErr && <span className="err" id={`${headId}-e`}>{nameErr}</span>}
                  </div>
                )}

                {mode === "design" && <DesignPanel value={x.design} onChange={(d) => patch(i, { design: d })} />}
              </section>
            );
          })}
        </div>

        {mode === "name" && (
          <div className="panel" style={{ marginTop: 0 }}>
            <span className="lbl" id={`${uid}-font`}>الخط (للاسمين)</span>
            <div className="fonts" role="group" aria-labelledby={`${uid}-font`}>
              {nameFonts.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`fo${f.id === font ? " on" : ""}`}
                  aria-pressed={f.id === font}
                  aria-label={`خط ${f.label}`}
                  onClick={() => setFont(f.id)}
                >
                  <span className="s" style={{ fontFamily: fontCss(f.id) }}>{sample}</span>
                  <span className="n">{f.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode !== "standard" && (
          <div className="panel" style={{ marginTop: 0 }}>
            <label htmlFor={`${uid}-notes`} className="lbl">
              <span>ملاحظات التخصيص (اختياري)</span>
              <span className="muted" aria-live="polite">{[...notes].length}/500</span>
            </label>
            <textarea
              id={`${uid}-notes`}
              className="inp cpl-notes"
              maxLength={500}
              placeholder="مثلاً: الاسم على الجيب، أو حجم التصميم، أو أي تعليمات خاصة."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="rise d3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <QtyStepper large value={qty} onChange={setQty} />
          <Button block disabled={cantAdd} onClick={submit}>
            {editing ? "حفظ التعديلات" : "أضف للسلة"}
          </Button>
        </div>
        {cantAdd && <span className="muted" style={{ fontSize: 13 }} role="status">{cantAddMsg}</span>}
      </div>

      <ProductInfo product={p} />
    </div>
  );
}
