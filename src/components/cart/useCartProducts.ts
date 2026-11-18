"use client";

import { useEffect, useMemo, useState } from "react";
import { getCartProducts } from "@/app/actions/cart";
import type { Product } from "@/lib/types";
import { isProductColor, productRules } from "@/lib/product-rules";
import { useCart } from "@/store/cart";

/**
 * Resolves the products behind the cart lines via a server action (cached on the server),
 * so the client never needs the whole catalog. Refreshes whenever the set of slugs changes
 * or `refreshKey` changes (e.g. when the drawer opens) so prices are never stale.
 */
export function useCartProducts(refreshKey?: unknown) {
  const lines = useCart((s) => s.lines);
  const slugKey = useMemo(() => [...new Set(lines.map((l) => l.productId))].sort().join(","), [lines]);
  const [state, setState] = useState<{ key: string; map: Map<string, Product> }>({ key: "", map: new Map() });

  useEffect(() => {
    if (!slugKey) return;
    let live = true;
    getCartProducts(slugKey.split(","))
      .then((list) => {
        if (!live) return;
        const map = new Map(list.map((p) => [p.slug, p]));
        // Reconcile carts saved before the category-specific rules were introduced.
        // Prices and visible options must agree with the current ordering rules.
        for (const line of useCart.getState().lines) {
          const product = map.get(line.productId);
          if (!product) continue;
          const rules = productRules(product);
          if (!rules.customization && (line.mode !== "standard" || line.text || line.font || line.designPath || line.designName || line.color || line.notes)) {
            useCart.getState().replace(line.key, { ...line, mode: "standard", text: null, font: null, designPath: null, designName: null, color: null, notes: null });
          } else if (rules.textile && (!isProductColor(line.color) || line.font)) {
            useCart.getState().replace(line.key, { ...line, color: isProductColor(line.color) ? line.color : "black", font: null });
          }
        }
        setState({ key: slugKey, map });
      })
      .catch(() => live && setState({ key: slugKey, map: new Map() }));
    return () => {
      live = false;
    };
  }, [slugKey, refreshKey]);

  return { products: state.map, loaded: !slugKey || state.key === slugKey };
}
