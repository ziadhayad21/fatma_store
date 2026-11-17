"use server";

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
};

export type PlaceOrderResult =
  | { ok: true; orderId: string; number: number }
  | { ok: false; error: string; fieldErrors?: CustomerErrors };

const FONTS = new Set(["ruqaa", "kufi", "naskh", "bold", "modern"]);

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
  for (const path of new Set(lines.filter((l) => l.mode === "design").map((l) => l.designPath))) {
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

  // 4) payment (COD: nothing to charge)
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
    },
    p_items: priced.lines.map((l) => ({
      product_id: products.get(l.productId)!.id,
      name_snapshot: l.productName,
      mode: l.mode,
      text: l.mode === "name" ? normalizeName(l.text ?? "") : null,
      font: l.mode === "name" ? l.font : null,
      design_path: l.mode === "design" ? l.designPath : null,
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
  return { ok: true, orderId: res.id, number: Number(res.number) };
}
