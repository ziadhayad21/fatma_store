import "server-only";
import type { PaymentMethodId } from "./index";

export type PaymentResult = { ok: true } | { ok: false; error: string };

export interface PaymentProvider {
  id: PaymentMethodId;
  /** Called after pricing, before the order row is written. A gateway would create/charge an intent here. */
  authorize(order: { total: number; phone: string }): Promise<PaymentResult>;
}

const cod: PaymentProvider = {
  id: "cod",
  // nothing to charge: the courier collects cash on delivery
  authorize: async () => ({ ok: true }),
};

const providers: Record<PaymentMethodId, PaymentProvider> = { cod };

export const getPaymentProvider = (id: PaymentMethodId) => providers[id];
