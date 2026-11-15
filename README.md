# فاطمة — e-commerce site

Arabic-first (RTL) store for printed kitchen towels, aprons and tote bags.
Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind 4 · Zustand · Supabase.
Payment: **Cash on Delivery only** (all payment logic lives in `src/lib/payments`).

```bash
npm install
cp .env.example .env.local   # then fill it in (see below)
npm run dev                  # http://localhost:3000
```

Without Supabase variables the storefront still runs on built-in seed data (dev convenience).
Checkout, design uploads, newsletter and the admin need the real backend.

---

## 1. Supabase setup (one time)

### 1.1 Environment variables
Fill `.env.local` (it is gitignored). Where to find each value in the dashboard:

| Variable | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → **Data API** → *Project URL* (`https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → **API Keys** → *Publishable key* (`sb_publishable_…`) — safe for browsers |
| `SUPABASE_SECRET_KEY` | Project Settings → **API Keys** → *Secret keys* → copy the default key (`sb_secret_…`) — **server only**, bypasses RLS |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally, your real domain in production |

The secret key is read only in `src/lib/supabase/admin.ts` (marked `server-only`, so importing it from client code
is a build error). It is never prefixed with `NEXT_PUBLIC_`. (If your project still shows the legacy
`service_role` key instead, it works in the same variable.)

### 1.2 Migrations (versioned in `supabase/migrations`)
Run these yourself, in the project folder:

```bash
npx supabase login                       # opens the browser once
npx supabase link --project-ref <ref>    # <ref> = the xxxx in https://xxxx.supabase.co ; asks for the DB password you chose when creating the project
npm run db:dry                           # optional: shows what will be applied
npm run db:push                          # applies the pending migrations to the hosted database (needs the DB password; if it is rejected, see the note below)
```

| Migration | What it does |
|---|---|
| `…0100_schema.sql` | tables, constraints, indexes, `create_order()`, `is_admin()`, `grant_admin()`, grants and **RLS on every table** |
| `…0200_storage.sql` | buckets `product-images` (public) and `designs` (**private**) + admin-only storage policies |
| `…0300_seed.sql` | 3 categories, 3 products (placeholder prices), the 27 governorates (fees **empty**) — idempotent |

### 1.3 Auth settings
Authentication → **Sign In / Providers** → Email: keep enabled, and **turn off "Allow new users to sign up"**
(the only accounts that should exist are admins).

### 1.4 First admin
1. Authentication → **Users** → *Add user* → *Create new user*: your email + a strong password, tick *Auto Confirm User*.
2. SQL Editor → run (with your email):
   ```sql
   select public.grant_admin('you@example.com');
   ```
Only users listed in `public.admins` pass `public.is_admin()`; every policy on orders, order items, subscribers
and customer uploads is built on that function.

> If `db push` rejects the database password (a password containing `@` can trip it), you can apply the same files with the
> CLI's API route, which only needs your `supabase login`:
> `npx supabase db query --remote --yes --file supabase/migrations/<file>.sql` (in order), then record them in
> `supabase_migrations.schema_migrations` so a later `db push` skips them.

### 1.5 Shipping fees
No fee is invented: every governorate starts with `fee = NULL`, and checkout refuses governorates without a fee.
Set them in the admin (`/admin/shipping`) — or in Table Editor → `shipping_rates`.

### 1.6 Verify the real project
```bash
npm run verify:supabase
# optional admin checks:  VERIFY_ADMIN_EMAIL=… VERIFY_ADMIN_PASSWORD=… npm run verify:supabase
```
It checks seed + RLS from the anon role, bucket privacy, the exact upload protocol the product page uses
(signed upload URL + browser-style PUT), signed downloads, the `create_order` RPC, and (optionally) admin access.
It creates and deletes one test order and one test upload.

---

## 1.7 Admin console (`/admin`)
Sign in with the admin account created in 1.4. Everything is Arabic/RTL and works on mobile.
- **الطلبات** — filter by status, search by order number / phone / name, order detail with the customer's name rendered in the chosen font,
  the uploaded design (signed URL + download button), WhatsApp/phone links and status updates (new → confirmed → printing → shipped → delivered / cancelled).
- **المنتجات / الأقسام** — create and edit, prices and print fee, descriptions, show/hide, sort order and image upload to the public `product-images` bucket (reorder, captions).
  Categories drive the navigation, footer, chips and home tiles automatically. A category's slug is fixed after creation (it is part of public URLs).
- **الشحن** — fee per governorate; blank = not available.
- **المشتركين** — newsletter list + CSV export.
Every save calls the cache invalidation helpers, so the storefront changes on the next request.
Security: `src/proxy.ts` refreshes the session and redirects anonymous visitors; **every page and server action re-checks** `getUser()` + `is_admin()`
(`src/lib/admin/auth.ts`) and talks to Postgres with the admin's own session, so Row Level Security still applies. Admin responses are `noindex, no-store`.

```bash
npm run verify:admin -- admin@fatma.com          # proves anon / non-admin / admin access against your project
node --env-file=.env.local scripts/admin-live.mjs # full admin end-to-end run (needs a running production server on :3111)
node --env-file=.env.local scripts/e2e-live.mjs   # checkout end-to-end (needs a temporary shipping fee + fresh build)
```

## 2. How data and caching work
- `src/lib/catalog.ts` is the only read layer. Every function is `"use cache"` with `cacheLife("catalog")`
  and tags `catalog`, `products`, `categories`, `shipping`, `category:<slug>`, `product:<slug>`.
- Admin writes call `invalidateCatalog()` / `invalidateShipping()` (`src/lib/revalidate.ts`) from Server Actions → changes show immediately.
- Product and collection routes are deliberately **not** prerendered per slug (no `generateStaticParams`): that is what makes edits and
  newly added products/categories appear on the very next request.
- Cart, checkout and order pages are dynamic. Prices are always recomputed on the server in `src/lib/pricing/order.ts`
  (shipping and any future add-on are pluggable `PricingModule`s).

## 3. Uploads (customer designs)
1. Browser → server action `requestDesignUpload` (type/size validated) → single-use **signed upload URL** for the private `designs` bucket.
2. Browser PUTs the file to that URL (real progress), then `confirmDesignUpload` checks the object (size + mime) server-side.
3. The cart stores only the path. Thumbnails use short-lived signed URLs, so they survive reloads.
4. The bucket itself enforces 10 MB and PNG/JPG/WEBP. Admins read files through signed URLs; there is no anonymous policy.

## 4. Tests & checks
```bash
npm test            # unit tests + RLS tests (real migrations run in an in-process Postgres)
npm run lint && npm run typecheck && npm run build
# browser checks against a running production server (npm run build && npx next start -p 3111):
node scripts/behavior-check.mjs
node scripts/personalization-check.mjs
node scripts/edit-flow-check.mjs
```

## 5. Deploy (Vercel)

### 5.1 Checklist
1. **Repo:** push the project. `.vercelignore` already keeps `fatma-site-kit/`, `fatma-site-kit.zip`, `scripts/`, `.env*` and logs out of the deployment (and `tsconfig`/ESLint already ignore the kit). The kit's images the site needs are copies in `public/`. Once you're done with the kit you can delete the folder and the zip.
2. **Database:** `npm run db:dry` must say *up to date* (or list only migrations you intend to apply); run `npm run db:push` and confirm. The hosted database is the same project the site uses; there is no separate staging database unless you create one.
3. **Environment variables** (Project → Settings → Environment Variables, *Production* and *Preview*):

   | Variable | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | origin only |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable (anon) key | safe for the browser |
   | `SUPABASE_SECRET_KEY` | secret / service-role key | **server only**, never `NEXT_PUBLIC_` |
   | `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com` | no trailing path. Used for canonical URLs, sitemap, robots, Open Graph. If missing on Vercel the site falls back to the project's production `*.vercel.app` domain |
   | `CRON_SECRET` | any long random string | Vercel sends it as `Authorization: Bearer …` to the daily cleanup job (`vercel.json`) |

   `SUPABASE_DB_PASSWORD` is only for the CLI on your computer; do **not** add it to Vercel.
4. **Supabase → Authentication → URL Configuration:** *Site URL* = the production origin; add it (and `https://*.vercel.app` if you use previews) to *Redirect URLs*. Keep **public sign-ups disabled** (Authentication → Providers → Email → *Allow new users to sign up* off): the only accounts are admins you create by hand. Admins are rows in `public.admins` (`select public.grant_admin('email')`).
5. **First deploy checks:** `/robots.txt` and `/sitemap.xml` show the right domain; `/admin` redirects to the login; sign in; set shipping fees in `/admin/shipping` (checkout accepts no governorate until you do); place a test order and delete it in the Supabase Table Editor.
6. **Response headers** (set in `next.config.ts`): HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and a CSP limited to `frame-ancestors`, `base-uri`, `form-action`, `object-src`. A `script-src` CSP is intentionally not set: it needs per-request nonces, which would turn off the page cache. `/admin` also gets `noindex` and `no-store` from `src/proxy.ts`.

### 5.2 When the real domain is connected
- Add the domain in Vercel → Domains, then set `NEXT_PUBLIC_SITE_URL` to it and **redeploy** (it is read at build time for canonical URLs and the sitemap).
- Supabase → Authentication → URL Configuration: change *Site URL* and add the new domain to *Redirect URLs*.
- Images: no change needed — product photos come from Supabase Storage on your Supabase host.
- Re-submit `https://your-domain.com/sitemap.xml` in Google Search Console.
- If you later add a CDN/proxy in front (Cloudflare etc.), the rate limiter reads the client address from `x-forwarded-for`; make sure the proxy sets it.

### 5.3 Housekeeping job
`vercel.json` runs `/api/cron/cleanup` daily (03:00 UTC, available on the free Vercel plan). It deletes customer uploads older than 24 h that no order references, and old rate-limit counters. Without `CRON_SECRET` the route answers 401 and does nothing. Run it by hand with `curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/cleanup`.

### 5.4 Rate limits
Table `rate_limits` + function `hit_rate_limit` (migration `…0400`), used by `src/lib/rate-limit.ts`: design upload URLs 30 / 10 min, newsletter 5 / hour, orders 10 / hour, admin login 10 / 10 min — per client address. If the limiter is unreachable it lets the request through (a customer must always be able to order). Tune in `LIMITS`.

### 5.5 Order notifications (not built)
`src/lib/notifications/index.ts` exports `onOrderPlaced(order)`, called by `placeOrder` **after** the order is saved. Today it does nothing. To add email / WhatsApp / SMS: write a `Notifier` (`{ name, send(order) }`) with the provider's SDK, add it to the `notifiers` array in that file, and add the provider's key as a server environment variable. Each notifier runs in isolation with a 3-second limit and its errors are only logged, so a provider outage can never fail or slow a checkout. `PlacedOrder` carries the customer, address, totals and each line (mode, name text, font). For a design upload, send the admin link `/admin/orders/<id>` rather than the file itself (the file is private).

## 6. Known gaps / notes
- Orphaned uploads are removed by the daily cleanup job (5.3); upload, newsletter, order and login endpoints are rate limited (5.4).
- Visual pass: `node --env-file=.env.local scripts/visual-pass.mjs shots-final` screenshots every storefront and admin page at 1440 and 390 and checks overflow, alt text, h1, broken images and request errors (it creates and removes a temporary admin, order and Cairo fee).
- Supabase clients use `cache: "no-store"` on `fetch`: caching belongs to `use cache` + tags only. (Without it Next.js also kept raw REST responses across builds.)
- The storefront treats out-of-band database edits (made directly in the Supabase dashboard) as fresh after at most 5 minutes; edits made in the admin are instant.
