"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { Button } from "@/components/ui/Button";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { designInUse } from "@/lib/cart-actions";
import { formatPrice } from "@/lib/format";
import { normalizeName, validateName } from "@/lib/personalization";
import { unitPrice } from "@/lib/pricing";
import type { FontId, OrderMode, Product } from "@/lib/types";
import { designUploader } from "@/lib/upload";
import { useCart, type CartLine } from "@/store/cart";
import { useUI } from "@/store/ui";
import { DesignPanel, type DesignState } from "./DesignPanel";
import { NamePanel } from "./NamePanel";

const WAYS: { id: OrderMode; title: string; sub: string; extra: string }[] = [
  { id: "standard", title: "زي ما هو", sub: "المنتج بتصميمه الأصلي", extra: "" },
  { id: "name", title: "اكتب اسمك عليه", sub: "اسم أو كلمة بالخط اللي يعجبك", extra: "+ طباعة" },
  { id: "design", title: "ارفع تصميمك", sub: "لوجو، رسمة أو صورة", extra: "+ طباعة" },
];

/**
 * `?edit=<cart line key>` (from the cart's "عدّل") opens this page pre-filled with that line;
 * saving writes the changes back to the same line instead of adding a new one.
 */
export function ProductPurchase({ product }: { product: Product }) {
  return (
    <Suspense fallback={<PurchaseForm product={product} initial={null} />}>
      <EditAware product={product} />
    </Suspense>
  );
}

function EditAware({ product }: { product: Product }) {
  const editKey = useSearchParams().get("edit");
  const line = useCart((s) => (editKey ? s.lines.find((l) => l.key === editKey && l.productId === product.slug) : undefined));
  // the key remounts the form when the cart line (re)hydrates from localStorage
  return <PurchaseForm key={line?.key ?? "new"} product={product} initial={line ?? null} />;
}

function PurchaseForm({ product: p, initial }: { product: Product; initial: CartLine | null }) {
  const router = useRouter();
  const editing = initial !== null;
  const [mode, setMode] = useState<OrderMode>(initial?.mode ?? "standard");
  const [qty, setQty] = useState(initial?.qty ?? 1);
  const [name, setName] = useState(initial?.text ?? "");
  const [font, setFont] = useState<FontId>(initial?.font ?? "ruqaa");
  const [design, setDesign] = useState<DesignState>(
    initial?.designPath
      ? { status: "done", name: initial.designName ?? "تصميم", path: initial.designPath, previewUrl: null }
      : { status: "idle" },
  );
  const add = useCart((s) => s.add);
  const replace = useCart((s) => s.replace);
  const openCart = useUI((s) => s.openCart);

  // Add-to-cart stays disabled until the chosen option is complete.
  const cantAdd = (mode === "name" && !validateName(name).ok) || (mode === "design" && design.status !== "done");
  const cantAddMsg =
    mode === "name"
      ? "اكتب الاسم الأول عشان تقدر تضيفه للسلة."
      : design.status === "uploading"
        ? "استنى لحد ما التصميم يخلّص رفع."
        : "ارفع التصميم الأول عشان تقدر تضيفه للسلة.";

  function buildLine() {
    if (mode === "name") {
      return { productId: p.slug, mode, text: normalizeName(name), font, designPath: null, designName: null, qty } as const;
    }
    if (mode === "design" && design.status === "done") {
      return { productId: p.slug, mode, text: null, font: null, designPath: design.path, designName: design.name, qty } as const;
    }
    return { productId: p.slug, mode: "standard", text: null, font: null, designPath: null, designName: null, qty } as const;
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
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span className="price" style={{ fontSize: 20 }}>{formatPrice(unitPrice(p, mode))}</span>
          {mode !== "standard" && (
            <span className="rise" style={{ fontSize: 14, color: "var(--accent)" }}>+ تكلفة الطباعة</span>
          )}
        </div>
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 15 }}>{p.description_ar}</p>
      </div>

      {editing && (
        <div className="edit-note" role="status">
          <span>بتعدّل المنتج ده في السلة.</span>
          <Link href="/cart" className="rm">إلغاء</Link>
        </div>
      )}

      <div className="rise d2" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="lbl" id="way">طريقة الطلب</span>
        <div role="group" aria-labelledby="way" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {WAYS.map((w) => {
            const on = mode === w.id;
            return (
              <button key={w.id} type="button" className={`opt${on ? " on" : ""}`} aria-pressed={on} onClick={() => setMode(w.id)}>
                <span className="rd" aria-hidden="true"><i /></span>
                <span style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{w.title}</span>
                  <span className="muted" style={{ fontSize: 13 }}>{w.sub}</span>
                </span>
                <span style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>{w.extra}</span>
              </button>
            );
          })}
        </div>
      </div>

      {mode === "name" && <NamePanel name={name} font={font} onName={setName} onFont={setFont} />}
      {mode === "design" && <DesignPanel value={design} onChange={setDesign} />}

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
