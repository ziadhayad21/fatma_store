"use client";

import { PaymentProof } from "./PaymentProof";
import { productRules, depositAmount, DEPOSIT_NUMBER } from "@/lib/product-rules";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { placeOrder } from "@/app/actions/checkout";
import { useCartProducts } from "@/components/cart/useCartProducts";
import { useDesignUrls } from "@/components/cart/useDesignUrls";
import { PriceDisplay } from "@/components/shop/PriceDisplay";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cleanCustomer, validateCustomer, type CustomerErrors, type CustomerInput } from "@/lib/checkout";
import type { ShippingRate } from "@/lib/data/types";
import { formatPrice } from "@/lib/format";
import { governorates } from "@/lib/governorates";
import { defaultPaymentMethod, paymentMethods } from "@/lib/payments";
import { variantText } from "@/lib/pricing";
import { findColor, productPrice, roundMoney } from "@/lib/pricing/discount";
import { useCart } from "@/store/cart";
import { useCartHydrated } from "@/store/useStoreHydrated";

const EMPTY: CustomerInput = { name: "", phone: "", governorate: "", area: "", address: "", notes: "" };

export function CheckoutForm({ rates }: { rates: ShippingRate[] }) {
  const router = useRouter();
  const uid = useId();
  const storedLines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);
  const hydrated = useCartHydrated();
  const { products, loaded } = useCartProducts();
  const designUrls = useDesignUrls(storedLines.map((l) => l.designPath));

  const [form, setForm] = useState<CustomerInput>(EMPTY);
  const [depositMethod, setDepositMethod] = useState("instapay");
  const [proofPath, setProofPath] = useState<string | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [errors, setErrors] = useState<CustomerErrors>({});
  const [formError, setFormError] = useState("");
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const lines = storedLines.filter((l) => products.has(l.productId));
  const customizationNotes = lines
    .filter((l) => (l.mode === "name" || l.mode === "design") && l.notes?.trim())
    .map((l) => {
      const p = products.get(l.productId);
      const name = p ? p.name_ar : l.productId;
      return lines.filter((x) => x.notes?.trim()).length > 1
        ? `${name}: ${l.notes!.trim()}`
        : l.notes!.trim();
    })
    .join("\n\n") || null;
  // until localStorage was read we do not know whether the cart is empty: show a placeholder of about the
  // final height instead of flashing the empty state (that made the footer jump)
  const waiting = !hydrated || (storedLines.length > 0 && !loaded);
  const itemsTotal = roundMoney(lines.reduce((a, l) => a + productPrice(products.get(l.productId)!, { color: l.color, qty: l.qty }).price, 0));
  const rate = rates.find((r) => r.governorate === form.governorate);
  const shippingKnown = !!rate && rate.fee !== null;
  const total = roundMoney(itemsTotal + (shippingKnown ? rate!.fee! : 0));
  const requiresDeposit = lines.some((l) => productRules(products.get(l.productId)!).deposit);
  const deposit = requiresDeposit ? depositAmount(total) : 0;
  const shippingBlocked = !!form.governorate && !shippingKnown;

  const set = (k: keyof CustomerInput) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError("");
    const customer = cleanCustomer(form);
    const found = validateCustomer(customer);
    if (Object.keys(found).length) {
      setErrors(found);
      const first = (["name", "phone", "governorate", "area", "address", "notes"] as const).find((k) => found[k]);
      if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    if (shippingBlocked) {
      setErrors({ governorate: "الشحن لمحافظتك مش متاح دلوقتي." });
      return;
    }
    if (requiresDeposit && (!proofPath || proofBusy)) { setFormError("ارفع صورة إثبات تحويل العربون قبل إرسال الطلب."); return; }
    start(async () => {
      const res = await placeOrder({
        customer,
        website,
        customizationNotes,
        depositMethod,
        paymentProofPath: proofPath,
        paymentMethod: defaultPaymentMethod,
        lines: lines.map((l) => ({
          productId: l.productId,
          mode: l.mode,
          text: l.text,
          font: l.font,
          color: l.color,
          designPath: l.designPath,
          qty: l.qty,
        })),
      });
      if (res.ok) {
        clear();
        router.push(`/order/${res.orderId}`);
        return;
      }
      setFormError(res.error);
      if (res.fieldErrors) setErrors(res.fieldErrors);
    });
  }

  const isEmpty = !waiting && lines.length === 0;
  const err = (k: keyof CustomerInput) => errors[k];
  const field = (k: keyof CustomerInput) => ({
    id: `${uid}-${k}`,
    name: k,
    "aria-invalid": err(k) ? true : undefined,
    "aria-describedby": err(k) ? `${uid}-${k}-e` : undefined,
  });
  const fieldErr = (k: keyof CustomerInput) =>
    err(k) ? (
      <span className="err" id={`${uid}-${k}-e`} role="alert">{err(k)}</span>
    ) : null;

  return (
    <div className="wrap" style={{ paddingBottom: 112 }}>
      <nav className="crumb crumb-pad" aria-label="مسار الصفحة">
        <Link href="/">الرئيسية</Link>
        <span aria-hidden="true">/</span>
        <Link href="/cart">سلة التسوق</Link>
        <span aria-hidden="true">/</span>
        <span style={{ color: "var(--ink)" }}>إتمام الطلب</span>
      </nav>
      <h1 className="rise" style={{ fontSize: "clamp(36px, 4vw, 56px)", margin: "8px 0 40px" }}>إتمام الطلب</h1>

      {isEmpty && (
        <div className="empty rise">
          <span style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--image)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="bag" size={21} />
          </span>
          <h2 style={{ fontSize: 26 }}>سلتك فاضية</h2>
          <p className="muted" style={{ margin: 0 }}>ضيف منتج الأول عشان تقدر تكمّل الطلب.</p>
          <Button href="/#categories">تسوّق المنتجات</Button>
        </div>
      )}

      {waiting && <div className="sk" style={{ height: 640 }} aria-busy="true" />}

      {!isEmpty && !waiting && (
        <div className="co">
          <form ref={formRef} className="co-form rise" onSubmit={onSubmit} noValidate>
            <fieldset className="co-sec">
              <legend>بيانات التوصيل</legend>
              <div className="co-grid">
                <div className="fld">
                  <label htmlFor={`${uid}-name`}>الاسم بالكامل</label>
                  <input className="inp" type="text" autoComplete="name" value={form.name} onChange={(e) => set("name")(e.target.value)} {...field("name")} />
                  {fieldErr("name")}
                </div>
                <div className="fld">
                  <label htmlFor={`${uid}-phone`}>رقم الموبايل</label>
                  <input
                    className="inp"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    style={{ textAlign: "right" }}
                    placeholder="01012345678"
                    value={form.phone}
                    onChange={(e) => set("phone")(e.target.value)}
                    {...field("phone")}
                  />
                  {fieldErr("phone")}
                </div>
                <div className="fld">
                  <label htmlFor={`${uid}-governorate`}>المحافظة</label>
                  <select
                    className="sel"
                    autoComplete="address-level1"
                    value={form.governorate}
                    onChange={(e) => set("governorate")(e.target.value)}
                    {...field("governorate")}
                  >
                    <option value="">اختار المحافظة</option>
                    {governorates.map((g) => {
                      const r = rates.find((x) => x.governorate === g);
                      const off = !r || r.fee === null;
                      return (
                        <option key={g} value={g} disabled={off}>
                          {g}
                          {off ? " — الشحن غير متاح حاليًا" : ""}
                        </option>
                      );
                    })}
                  </select>
                  {fieldErr("governorate")}
                </div>
                <div className="fld">
                  <label htmlFor={`${uid}-area`}>المنطقة / المدينة</label>
                  <input className="inp" type="text" autoComplete="address-level2" value={form.area} onChange={(e) => set("area")(e.target.value)} {...field("area")} />
                  {fieldErr("area")}
                </div>
                <div className="fld fld-span">
                  <label htmlFor={`${uid}-address`}>العنوان بالتفصيل</label>
                  <input className="inp" type="text" autoComplete="street-address" placeholder="الشارع، رقم العمارة، الدور، الشقة" value={form.address} onChange={(e) => set("address")(e.target.value)} {...field("address")} />
                  {fieldErr("address")}
                </div>
                <div className="fld fld-span">
                  <label htmlFor={`${uid}-notes`}>ملاحظات (اختياري)</label>
                  <textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} {...field("notes")} />
                  {fieldErr("notes")}
                </div>
              </div>
              {/* honeypot — hidden from people and assistive tech */}
              <div className="hp" aria-hidden="true">
                <label>
                  Website
                  <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </label>
              </div>
            </fieldset>

            <fieldset className="co-sec">
              <legend>{requiresDeposit ? "دفع المتبقي بعد العربون" : "طريقة الدفع"}</legend>
              <div role="radiogroup" aria-label="طريقة الدفع" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {paymentMethods.map((m) => (
                  <label key={m.id} className="pay-card">
                    <input type="radio" name="payment" value={m.id} checked readOnly className="vh" />
                    <span className="rd" aria-hidden="true" style={{ borderColor: "var(--ink)" }}><i style={{ transform: "scale(1)" }} /></span>
                    <span style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 15, fontWeight: 500 }}>{m.label}</span>
                      <span className="muted" style={{ fontSize: 13 }}>{requiresDeposit ? "العربون 30% مقدمًا عبر InstaPay أو Wallet، والباقي عند الاستلام." : m.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {requiresDeposit && <fieldset className="co-sec" disabled={pending}>
              <legend>العربون المطلوب (30%)</legend>
              <p>حوّل العربون عبر InstaPay أو Wallet إلى <bdi dir="ltr">{DEPOSIT_NUMBER}</bdi>.</p>
              <p>العربون 30% من إجمالي الطلب بعد الخصم شامل الشحن. الطلب لا يتأكد إلا بعد مراجعة الإدارة للتحويل.</p>
              <p>الإجمالي: {shippingKnown ? formatPrice(total) : "—"}<br />العربون المطلوب: {shippingKnown ? formatPrice(deposit) : "—"}<br />المتبقي بعد تأكيد العربون: {shippingKnown ? formatPrice(roundMoney(total - deposit)) : "—"}</p>
              <label htmlFor="deposit-method">طريقة تحويل العربون</label>
              <select id="deposit-method" className="sel" value={depositMethod} onChange={(e) => setDepositMethod(e.target.value)}><option value="instapay">InstaPay</option><option value="wallet">Wallet</option></select>
              <PaymentProof onChange={setProofPath} onBusy={setProofBusy} />
            </fieldset>}
            {formError && <p className="err" role="alert" style={{ fontSize: 14, margin: 0 }}>{formError}</p>}
            <Button type="submit" arrow block disabled={pending || shippingBlocked || (requiresDeposit && (!proofPath || proofBusy))} aria-busy={pending}>
              {pending ? "بنسجّل طلبك…" : requiresDeposit ? "إرسال الطلب لمراجعة العربون" : "تأكيد الطلب"}
            </Button>
          </form>

          <aside className="sum rise d2" aria-label="ملخص الطلب">
            <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>ملخص الطلب</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {lines.map((l) => {
                const p = products.get(l.productId)!;
                const img = p.images[0];
                const thumb = l.designPath ? designUrls[l.designPath] : undefined;
                return (
                  <div className="sum-line" key={l.key}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed URL, not optimizable
                      <img className="thumb-d" src={thumb} alt="التصميم اللي رفعته" width={56} height={72} />
                    ) : (
                      <Image src={img.src} alt="" width={56} height={72} style={{ objectPosition: img.position }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>{p.name_ar} <span className="muted">× {l.qty}</span></div>
                      <div className="muted" style={{ fontSize: 13, overflowWrap: "anywhere" }}>{variantText({ ...l, colorName: findColor(p, l.color)?.name_ar })}</div>
                    </div>
                    <PriceDisplay {...productPrice(p, { color: l.color, qty: l.qty })} />
                  </div>
                );
              })}
            </div>
            <div style={{ height: 1, background: "#dcd8d1" }} />
            <div className="sl"><span className="muted">المنتجات</span><span className="price">{formatPrice(itemsTotal)}</span></div>
            <div className="sl">
              <span className="muted">الشحن</span>
              {shippingKnown ? (
                <span className="price">{formatPrice(rate!.fee!)}</span>
              ) : (
                <span style={{ fontSize: 14 }}>{shippingBlocked ? "غير متاح حاليًا" : "اختار المحافظة"}</span>
              )}
            </div>
            <div style={{ height: 1, background: "#dcd8d1" }} />
            <div className="sl" style={{ fontSize: 18 }}>
              <span>الإجمالي</span>
              <span>{shippingKnown ? formatPrice(total) : "—"}</span>
            </div>
            {requiresDeposit && <><div className="sl"><span>العربون (30%)</span><span>{shippingKnown ? formatPrice(deposit) : "—"}</span></div><div className="sl"><span>المتبقي بعد تأكيد العربون</span><span>{shippingKnown ? formatPrice(roundMoney(total - deposit)) : "—"}</span></div></>}
            <span className="muted" style={{ fontSize: 12 }}>الإجمالي النهائي بيتحسب على السيرفر وقت تأكيد الطلب.</span>
          </aside>
        </div>
      )}
    </div>
  );
}
