import type { Metadata } from "next";
import { connection } from "next/server";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { source } from "@/lib/data/source";

export const metadata: Metadata = { title: "إتمام الطلب", robots: { index: false } };

// dev-only instant-navigation validation opt-out (see (shop)/layout.tsx)
export const instant = false;

export default async function CheckoutPage() {
  await connection();
  const rates = await source.shippingRates();
  return <CheckoutForm rates={rates} />;
}
