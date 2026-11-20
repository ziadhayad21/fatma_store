import "server-only";
import { headers } from "next/headers";
import { backendConfigured, createServiceClient } from "@/lib/supabase/admin";

/** Per-endpoint budgets (fixed windows). Generous for real shoppers, hostile to scripts. */
export const LIMITS = {
  upload: { windowSec: 600, max: 30 },
  order: { windowSec: 3600, max: 10 },
  login: { windowSec: 600, max: 10 },
  suggestion: { windowSec: 3600, max: 5 },
} as const;

export const RATE_LIMITED_MESSAGE = "محاولات كتير في وقت قصير. استنى شوية وجرّب تاني.";

async function clientId(): Promise<string> {
  const h = await headers();
  // On Vercel the platform sets x-forwarded-for, so the first hop is the real client address.
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

/**
 * Returns true when the caller may proceed. Backed by the `hit_rate_limit` SQL function.
 * Fails OPEN: if the limiter itself is unavailable a customer must still be able to order.
 */
export async function allow(bucket: keyof typeof LIMITS): Promise<boolean> {
  if (!backendConfigured()) return true;
  try {
    const { windowSec, max } = LIMITS[bucket];
    const { data, error } = await createServiceClient().rpc("hit_rate_limit", {
      p_key: `${bucket}:${await clientId()}`,
      p_window_seconds: windowSec,
      p_max: max,
    });
    if (error) {
      console.error("rate limit check failed", error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error("rate limit check failed", e instanceof Error ? e.message : e);
    return true;
  }
}
