"use client";

import { useEffect, useState } from "react";
import { getDesignPreviewUrls } from "@/app/actions/uploads";

const TTL = 50 * 60 * 1000; // signed URLs are issued for 60 min; refresh a bit early
const cache = new Map<string, { url: string; exp: number }>();

const fresh = (p: string) => {
  const hit = cache.get(p);
  return hit && hit.exp > Date.now() ? hit.url : undefined;
};
const remember = (map: Record<string, string>) => {
  const exp = Date.now() + TTL;
  for (const [p, url] of Object.entries(map)) cache.set(p, { url, exp });
};

/** Signed preview URLs for stored design paths (so thumbnails survive reloads). */
export function useDesignUrls(paths: (string | null | undefined)[]): Record<string, string> {
  const wanted = [...new Set(paths.filter((p): p is string => !!p))].sort();
  const key = wanted.join("|");
  const [, bump] = useState(0);

  useEffect(() => {
    const missing = key ? key.split("|").filter((p) => !fresh(p)) : [];
    if (missing.length === 0) return;
    let live = true;
    getDesignPreviewUrls(missing)
      .then((map) => {
        remember(map);
        if (live) bump((n) => n + 1);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key]);

  const out: Record<string, string> = {};
  for (const p of wanted) {
    const url = fresh(p);
    if (url) out[p] = url;
  }
  return out;
}
