"use client";

import { useEffect, useMemo, useState } from "react";
import { getCartProducts } from "@/app/actions/cart";
import type { Product } from "@/lib/types";
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
      .then((list) => live && setState({ key: slugKey, map: new Map(list.map((p) => [p.slug, p])) }))
      .catch(() => live && setState({ key: slugKey, map: new Map() }));
    return () => {
      live = false;
    };
  }, [slugKey, refreshKey]);

  return { products: state.map, loaded: !slugKey || state.key === slugKey };
}
