"use client";

import { useEffect } from "react";
import { useCart } from "./cart";
import { useWishlist } from "./wishlist";

/**
 * Stores use `skipHydration`, so server render and first client render both see
 * empty state (no mismatch). This rehydrates from localStorage right after mount.
 */
export function StoreHydrator() {
  useEffect(() => {
    void useCart.persist.rehydrate();
    void useWishlist.persist.rehydrate();
  }, []);
  return null;
}
