"use server";

import { confirmPaymentProofUpload } from "@/app/actions/payment-proofs";
import { productRules, depositAmount, isProductColor } from "@/lib/product-rules";
import { lineDesignPaths, type LinePiece, type StoredPiece } from "@/lib/couples";
import { confirmDesignUpload } from "@/app/actions/uploads";
import { cleanCustomer, validateCustomer, type CustomerErrors, type CustomerInput } from "@/lib/checkout";
import { toProduct, PRODUCT_SELECT, type JoinedRow } from "@/lib/data/supabase-source";
import { MAX_QTY } from "@/lib/limits";
import { onOrderPlaced } from "@/lib/notifications";
import { allow, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { isDesignPath, normalizeName } from "@/lib/personalization";
import { isPaymentMethodId } from "@/lib/payments";
import { getPaymentProvider } from "@/lib/payments/server";
import { activePricingModules } from "@/lib/pricing/modules";
import { priceOrder, PricingError, type OrderLineInput } from "@/lib/pricing/order";
import { backendConfigured, createServiceClient } from "@/lib/supabase/admin";
import type { Product } from "@/lib/types";

export type PlaceOrderInput = {
  customer: Partial<Record<keyof CustomerInput, unknown>>;
  lines: unknown[];
  paymentMethod: unknown;
  /** honeypot: real users never fill it */
  website?: unknown;
  customizationNotes?: unknown;
  depositMethod?: unknown;
  paymentProofPath?: unknown;
};

export type PlaceOrderResult =
  | { ok: true; orderId: string; number: number; /** the order needs a deposit */ deposit: boolean }
  | { ok: false; error: string; fieldErrors?: CustomerErrors };

const FONTS = new Set(["ruqaa", "kufi", "naskh", "bold", "modern"]);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

/** Couples pieces: shape only (at most 4; pricing checks them against the product). */
function parsePieces(raw: unknown): LinePiece[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > 4) return [];
  return raw.map((p) => {
    const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
    return {
      color: isProductColor(o.color) ? o.color : null,
      text: str(o.text, 100),
      designPath: str(o.designPath, 200),
      designName: str(o.designName, 200),
    };
  });
}

/** Coerce untrusted JSON into OrderLineInput (shape only — pricing validates the rules). */
function parseLines(raw: unknown[]): OrderLineInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return null;
  const out: OrderLineInput[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") return null;
    const l = r as Record<string, unknown>;
    const mode = l.mode;
    if (mode !== "standard" && mode !== "name" && mode !== "design") return null;
    out.push({
      productId: String(l.productId ?? ""),
      mode,
      text: typeof l.text === "string" ? l.text : null,
      font: typeof l.font === "string" && FONTS.has(l.font) ? (l.font as OrderLineInput["font"]) : null,
      designPath: typeof l.designPath === "string" ? l.designPath : null,
      color: isProductColor(l.color) ? l.color : null,
      pieces: parsePieces(l.pieces),
      qty: Number(l.qty),
    });
  }
  return out;
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  if (!backendConfigured()) return { ok: false, error: "الطلبات مش متاحة دلوقتي. جرّب بعد شوية." };
  if (input.website) return { ok: false, error: "تعذّر إرسال الطلب." }; // honeypot

  const customer = cleanCustomer(input.customer ?? {});
  const fieldErrors = validateCustomer(customer);
  if (Object.keys(fieldErrors).length) return { ok: false, error: "راجع البيانات المكتوبة.", fieldErrors };

  if (!isPaymentMethodId(input.paymentMethod)) return { ok: false, error: "طريقة الدفع غير متاحة." };
  if (!(await allow("order"))) return { ok: false, error: RATE_LIMITED_MESSAGE };
  const lines = parseLines(input.lines);
  if (!lines) return { ok: false, error: "السلة فاضية أو فيها بيانات غير صحيحة." };

  const sb = createServiceClient();

  // 1) authoritative product rows (never the client's prices)
  const slugs = [...new Set(lines.map((l) => l.productId))];
  const { data: rows, error: pErr } = await sb
    .from("products")
    .select(PRODUCT_SELECT)
    .in("slug", slugs)
    .eq("is_active", true)
    .eq("category.is_active", true);
  if (pErr) {
    console.error("placeOrder: products", pErr.message);
    return { ok: false, error: "حصلت مشكلة. جرّب تاني." };
  }
  const products = new Map<string, Product>(
    ((rows ?? []) as unknown as JoinedRow[]).map((r) => [r.slug, toProduct(r)] as const),
  );

  // 2) every uploaded design must exist in the private bucket
  for (const path of new Set(lines.filter((l) => l.mode === "design").flatMap((l) => (l.pieces ? lineDesignPaths({ pieces: l.pieces }) : [l.designPath])))) {
    if (!isDesignPath(path) || !(await confirmDesignUpload(path)).ok) {
      return { ok: false, error: "في تصميم مرفوع مش موجود. ارفعه تاني من صفحة المنتج." };
    }
  }

  // 3) price everything on the server
  let priced;
  try {
    priced = await priceOrder({
      lines,
      products,
      governorate: customer.governorate,
      modules: activePricingModules({
        shippingFee: async (g) => {
          const { data, error } = await sb.from("shipping_rates").select("fee").eq("governorate", g).maybeSingle();
          if (error) throw error;
          return data?.fee === null || data?.fee === undefined ? null : Number(data.fee);
        },
      }),
    });
  } catch (e) {
    if (e instanceof PricingError) {
      const msg =
        e.code === "unknown_product"
          ? "في منتج في السلة مبقاش متاح. شيله وكمّل."
          : e.code === "no_shipping_rate"
            ? e.message
            : e.code === "empty"
              ? "السلة فاضية."
              : `في منتج في السلة بياناته ناقصة: ${e.message}`;
      return { ok: false, error: msg, ...(e.code === "no_shipping_rate" ? { fieldErrors: { governorate: e.message } } : {}) };
    }
    console.error("placeOrder: pricing", e);
    return { ok: false, error: "حصلت مشكلة. جرّب تاني." };
  }

  const depositLines = priced.lines.filter((l) => productRules(products.get(l.productId)!).deposit);
  const requiresDeposit = depositLines.length > 0;
  const appliedDepositPercent = requiresDeposit
    ? Math.max(...depositLines.map((l) => products.get(l.productId)?.deposit_percent ?? 50))
    : 50;
  const hasCustomization = priced.lines.some((l) => productRules(products.get(l.productId)!).customization);
  const customizationNotes = hasCustomization && typeof input.customizationNotes === "string" && input.customizationNotes.trim()
    ? input.customizationNotes.trim()
    : null;
  if (customizationNotes && customizationNotes.length > 1000) return { ok: false, error: "ملاحظات التخصيص بحد أقصى ١٠٠٠ حرف." };
  let proofPath: string | null = null;
  if (requiresDeposit) {
    if (input.depositMethod !== "instapay" && input.depositMethod !== "wallet") return { ok: false, error: "اختار InstaPay أو Wallet لتحويل العربون." };
    if (typeof input.paymentProofPath !== "string" || !(await confirmPaymentProofUpload(input.paymentProofPath)).ok) return { ok: false, error: "ارفع صورة إثبات تحويل العربون قبل إرسال الطلب." };
    proofPath = input.paymentProofPath;
  }

  // 4) COD covers the balance; uploading a receipt never authorizes a payment.
  const pay = await getPaymentProvider(input.paymentMethod).authorize({ total: priced.total, phone: customer.phone });
  if (!pay.ok) return { ok: false, error: pay.error };

  // 5) one atomic write
  const { data, error } = await sb.rpc("create_order", {
    p_order: {
      customer_name: customer.name,
      phone: customer.phone,
      governorate: customer.governorate,
      area: customer.area,
      address: customer.address,
      notes: customer.notes,
      payment_method: input.paymentMethod,
      subtotal: priced.subtotal,
      shipping: priced.shipping,
      total: priced.total,
      customization_notes: customizationNotes,
      deposit_amount: requiresDeposit ? depositAmount(priced.total, appliedDepositPercent) : 0,
      deposit_status: requiresDeposit ? "submitted" : null,
      deposit_method: requiresDeposit ? input.depositMethod : null,
      payment_proof_path: proofPath,
      deposit_percent: requiresDeposit ? appliedDepositPercent : null,
    },
    p_items: priced.lines.map((l) => ({
      product_id: products.get(l.productId)!.id,
      name_snapshot: l.productName,
      mode: l.mode,
      // couples: the item's own columns keep piece 1 (older views stay readable); `pieces` has all of them.
      // Its font lives in the pieces (the colour rules keep the item's own font empty).
      ...(l.pieces
        ? {
            text: l.mode === "name" ? l.pieces[0].text : null,
            font: null,
            design_path: l.mode === "design" ? l.pieces[0].designPath : null,
            pieces: l.pieces.map((p): StoredPiece => ({
              label: p.label,
              color: p.color,
              color_name: p.colorName,
              text: l.mode === "name" ? p.text : null,
              font: l.mode === "name" ? l.font : null,
              design_path: l.mode === "design" ? p.designPath : null,
              design_name: l.mode === "design" ? p.designName : null,
            })),
          }
        : {
            text: l.mode === "name" ? normalizeName(l.text ?? "") : null,
            font: l.mode === "name" ? l.font : null,
            design_path: l.mode === "design" ? l.designPath : null,
          }),
      color: l.color ?? null,
      unit_price: l.unitPrice,
      original_unit_price: l.originalUnitPrice,
      discount_percent: l.discountPercent,
      qty: Math.min(l.qty, MAX_QTY),
    })),
  });
  if (error || !data) {
    console.error("placeOrder: create_order", error?.message);
    return { ok: false, error: "تعذّر تسجيل الطلب. جرّب تاني." };
  }
  const res = data as { id: string; number: number };

  // Saved. Notify (a no-op today); this must never affect the customer's result.
  try {
    await onOrderPlaced({
      id: res.id,
      number: Number(res.number),
      customerName: customer.name,
      phone: customer.phone,
      governorate: customer.governorate,
      area: customer.area,
      address: customer.address,
      notes: customer.notes ?? "",
      paymentMethod: String(input.paymentMethod),
      subtotal: priced.subtotal,
      shipping: priced.shipping,
      total: priced.total,
      items: priced.lines.map((l) => ({
        productName: l.productName,
        mode: l.mode,
        text: l.mode === "name" ? normalizeName(l.text ?? "") : null,
        font: l.mode === "name" ? (l.font ?? null) : null,
        qty: Math.min(l.qty, MAX_QTY),
        unitPrice: l.unitPrice,
      })),
    });
  } catch (e) {
    console.error("onOrderPlaced failed", e);
  }
  return { ok: true, orderId: res.id, number: Number(res.number), deposit: requiresDeposit };
}
