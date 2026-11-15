/** Public (browser-safe) configuration. The secret key lives in lib/supabase/admin.ts only. */
/** Accept a pasted endpoint like https://x.supabase.co/rest/v1/ and keep only the origin. */
function origin(v: string | undefined, fallback = "") {
  if (!v) return fallback;
  try {
    return new URL(v).origin;
  } catch {
    return fallback;
  }
}

export const publicEnv = {
  // NEXT_PUBLIC_SITE_URL wins; on Vercel fall back to the project's production domain so canonical
  // URLs and the sitemap never point at localhost even if the variable was forgotten.
  siteUrl: origin(
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000",
  ),
  supabaseUrl: origin(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
};

/** True when the public Supabase variables are set; otherwise the app falls back to seed data (dev only). */
export const hasSupabase = Boolean(publicEnv.supabaseUrl && publicEnv.supabasePublishableKey);
