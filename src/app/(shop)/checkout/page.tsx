import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { getShippingRates } from "@/lib/catalog";

export const metadata: Metadata = { title: "إتمام الطلب", robots: { index: false } };

// dev-only instant-navigation validation opt-out (see (shop)/layout.tsx)
export const instant = false;

export default async function CheckoutPage() {
  const rates = await getShippingRates();
  return <CheckoutForm rates={rates} />;
}
