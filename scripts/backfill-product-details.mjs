// One-off data fix: "تفاصيل المنتج" (details_ar) is empty on products whose "وصف المنتج" (description_ar) is
// filled. Copies the description into details for those products only; a product that already has details
// is never overwritten. Data only: no schema change.
//
//   node --env-file=.env.local scripts/backfill-product-details.mjs --dry-run   # list, write nothing
//   node --env-file=.env.local scripts/backfill-product-details.mjs             # for real
//
// The service key comes from the environment and is never printed.
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry-run");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. Run with: node --env-file=.env.local scripts/backfill-product-details.mjs");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: products, error } = await sb.from("products").select("id, slug, name_ar, description_ar, details_ar").order("created_at");
if (error) {
  console.error(`read products: ${error.message}`);
  process.exit(1);
}

const blank = (s) => !s || !String(s).trim();
let updated = 0;
let skipped = 0;
let failed = 0;
console.log(`${DRY ? "DRY RUN — nothing will be written" : "BACKFILL"} · ${products.length} products\n`);
for (const p of products) {
  if (!blank(p.details_ar)) {
    skipped++;
    console.log(`= ${p.slug}: has details already — skipped`);
    continue;
  }
  if (blank(p.description_ar)) {
    skipped++;
    console.log(`= ${p.slug}: no description either — skipped`);
    continue;
  }
  if (DRY) {
    updated++;
    console.log(`+ ${p.slug}: details ← description (${[...p.description_ar.trim()].length} chars)`);
    continue;
  }
  // only while details is still empty, so a concurrent admin edit is never overwritten
  const { data, error: upErr } = await sb
    .from("products")
    .update({ details_ar: p.description_ar.trim() })
    .eq("id", p.id)
    .or("details_ar.is.null,details_ar.eq.")
    .select("id");
  if (upErr) {
    failed++;
    console.error(`✗ ${p.slug}: ${upErr.message}`);
  } else if (!data?.length) {
    skipped++;
    console.log(`= ${p.slug}: changed meanwhile — skipped`);
  } else {
    updated++;
    console.log(`+ ${p.slug}: details ← description`);
  }
}
console.log(`\nsummary${DRY ? " (dry run)" : ""}: updated ${updated} · skipped ${skipped}${failed ? ` · failed ${failed}` : ""}`);
process.exitCode = failed ? 1 : 0;
