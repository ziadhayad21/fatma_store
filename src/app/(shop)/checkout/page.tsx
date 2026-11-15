import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { getShippingRates } from "@/lib/catalog";

export const metadata: Metadata = { title: "إتمام الطلب", robots: { index: false } };

export default async function CheckoutPage() {
  const rates = await getShippingRates();
  return <CheckoutForm rates={rates} />;
}
