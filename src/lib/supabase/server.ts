import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/**
 * Cookie-bound client for the signed-in user (admin console, phase 5). Uses the publishable key,
 * so Row Level Security applies with the user's own JWT. Call it only from dynamic (request-time)
 * code — it reads cookies.
 */
export async function createSessionClient() {
  const store = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component: the proxy refreshes the session instead
        }
      },
    },
  });
}
