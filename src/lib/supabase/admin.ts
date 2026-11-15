import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Service-role client (SECRET key). Bypasses Row Level Security.
 * `server-only` makes any import from a client component a build error.
 * Use it only inside Server Actions / Route Handlers / server components, after validating input,
 * and never return its rows to the browser without filtering.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!publicEnv.supabaseUrl || !key) {
    throw new BackendNotConfiguredError();
  }
  return createClient(publicEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // never let Next.js cache service-role responses (orders, signed URLs, ...)
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

export class BackendNotConfiguredError extends Error {
  constructor() {
    super("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY missing).");
  }
}

export const backendConfigured = () => Boolean(publicEnv.supabaseUrl && process.env.SUPABASE_SECRET_KEY);
