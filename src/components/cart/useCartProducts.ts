"use client";

import { useEffect, useMemo, useState } from "react";
import { getCartProducts } from "@/app/actions/cart";
import type { Product } from "@/lib/types";
import { findColor } from "@/lib/pricing/discount";
import { productRules } from "@/lib/product-rules";
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
          // couples: every piece keeps a colour that is still sold (else the first available one)
          if (rules.couples) {
            const fix = (c: string | null | undefined) => (rules.colors ? (findColor(product, c)?.id ?? product.colors[0]?.id ?? c ?? null) : null);
            const pieces = (line.pieces?.length ? line.pieces : [0, 1].map(() => ({ color: line.color ?? null, text: null, designPath: null, designName: null })))
              .map((p) => ({ ...p, color: fix(p.color) }));
            const changed = !line.pieces?.length || pieces.some((p, i) => p.color !== line.pieces![i].color);
            // a line saved before the product became couples can only stay "as is"
            if (changed) useCart.getState().replace(line.key, { ...line, ...(line.pieces?.length ? {} : { mode: "standard", text: null, font: null, designPath: null, designName: null, notes: null }), pieces, color: pieces[0].color });
            continue;
          }
          if (line.pieces?.length) {
            useCart.getState().replace(line.key, { ...line, pieces: null });
            continue;
          }
          // a colour that is no longer sold falls back to the first available one (its price is shown)
          const color = rules.colors ? (findColor(product, line.color)?.id ?? product.colors[0]?.id ?? line.color ?? null) : null;
          if (!rules.customization && (line.mode !== "standard" || line.text || line.font || line.designPath || line.designName || line.notes)) {
            useCart.getState().replace(line.key, { ...line, mode: "standard", text: null, font: null, designPath: null, designName: null, color, notes: null });
          } else if ((line.color ?? null) !== color || (!rules.font && line.font)) {
            useCart.getState().replace(line.key, { ...line, color, font: rules.font ? line.font : null });
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
