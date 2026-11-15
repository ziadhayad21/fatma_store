/**
 * Payment methods — the ONE place that knows which methods exist. Only Cash on Delivery for now.
 * The checkout UI renders `paymentMethods`; the server validates against it and runs the matching
 * provider in ./server.ts. To add an online gateway later: add an entry here + a provider there.
 */
export type PaymentMethodId = "cod";

export type PaymentMethod = {
  id: PaymentMethodId;
  label: string;
  description: string;
};

export const paymentMethods: readonly PaymentMethod[] = [
  { id: "cod", label: "الدفع عند الاستلام", description: "ادفع كاش للمندوب وقت استلام الطلب." },
];

export const defaultPaymentMethod: PaymentMethodId = "cod";

export const isPaymentMethodId = (v: unknown): v is PaymentMethodId =>
  typeof v === "string" && paymentMethods.some((m) => m.id === v);
