import type { NextConfig } from "next";

// Product photos uploaded from the admin live in the PUBLIC "product-images" bucket of this project.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return null;
  }
})();

// Security headers for every response. A script-src CSP is deliberately not set: Next needs inline
// scripts for hydration and a nonce-based CSP would force every page to render per request, which
// defeats the catalog cache. These directives are the ones that are safe with static rendering.
const csp = ["frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"].join("; ");
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  cacheLife: {
    // Catalog reads: fresh 1 min on the client, revalidate every 5 min, hard expire hourly.
    // Admin edits expire entries immediately through tags (lib/revalidate.ts).
    catalog: { stale: 60, revalidate: 300, expire: 3600 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/product-images/**" }]
      : [],
  },
};

export default nextConfig;
