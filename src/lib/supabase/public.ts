import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Anonymous, session-less client (publishable key). Used for public catalog reads inside
 * `use cache` functions — it never touches cookies, so results are shareable across visitors
 * and Row Level Security decides what is visible.
 *
 * `cache: "no-store"`: caching is owned by `use cache` + tags (lib/catalog.ts). Without this, Next.js
 * also keeps the raw PostgREST responses in its fetch cache across requests AND builds, which would
 * make admin edits (and manual dashboard edits) show up late or not at all.
 */
export function createPublicClient() {
  return createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
