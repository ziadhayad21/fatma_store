import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";

export const metadata: Metadata = { title: "سلة التسوق", robots: { index: false } };

// dev-only instant-navigation validation opt-out (see (shop)/layout.tsx)
export const instant = false;

export default function CartPage() {
  return <CartView />;
}
