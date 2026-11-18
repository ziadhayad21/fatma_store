import type { Product } from "./types";
import { roundMoney } from "./pricing/discount";

export const COLORS = ["black", "white", "pink"] as const;
export type ProductColor = (typeof COLORS)[number];
export const COLOR_LABEL: Record<ProductColor, string> = { black: "Black", white: "White", pink: "Pink" };
export const isProductColor = (v: unknown): v is ProductColor => COLORS.includes(v as ProductColor);
export function productRules(product: Pick<Product, "category_slug">) {
  const textile = ["aprons", "towels"].includes(product.category_slug);
  return { textile, customization: product.category_slug !== "bags", deposit: textile };
}
export const DEPOSIT_NUMBER = "01155907797";
export const depositAmount = (total: number) => roundMoney(total * 0.3);
export type DepositStatus = "pending" | "submitted" | "confirmed";
export const DEPOSIT_LABEL: Record<DepositStatus, string> = {
  pending: "Deposit Pending — في انتظار العربون",
  submitted: "Deposit Submitted — في انتظار مراجعة التحويل",
  confirmed: "Deposit Confirmed — تم تأكيد العربون",
};
export const PROOF_BUCKET = "payment-proofs";
export const isProofPath = (v: unknown): v is string => typeof v === "string" && /^proofs\/\d{4}-\d{2}\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(png|jpg|webp)$/i.test(v);
