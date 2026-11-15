"use client";

import { useSyncExternalStore } from "react";
import { useCart } from "./cart";

/** False on the server and on the first client render; true once the persisted cart was read from localStorage. */
export function useCartHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useCart.persist.onFinishHydration(cb),
    () => useCart.persist.hasHydrated(),
    () => false,
  );
}
