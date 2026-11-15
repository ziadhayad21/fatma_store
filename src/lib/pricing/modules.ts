import "server-only";
import { createShippingModule, type PricingModule } from "./order";

/**
 * The active pricing modules, in order. Checkout calls this and nothing else.
 * Future add-ons (coupons, gift wrapping, online-payment fees, a shipping-company API) are
 * implemented as `PricingModule`s and appended here — the checkout UI and priceOrder() stay as they are.
 */
export function activePricingModules(deps: {
  shippingFee: (governorate: string) => Promise<number | null>;
}): PricingModule[] {
  return [createShippingModule(deps.shippingFee)];
}
