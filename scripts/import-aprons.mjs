// Imports the aprons in aprons-import/manifest.json as regular, published products in المريلات.
//
//   node --env-file=.env.local scripts/import-aprons.mjs --dry-run   # what would happen, writes nothing
//   node --env-file=.env.local scripts/import-aprons.mjs             # for real
//   (optional: --dir <folder that holds manifest.json>; default: aprons-import, or aprons-import/aprons-import)
//
// Same data shape as the admin (saveProduct):
//   * slug from the Arabic name with the admin's own generator (src/lib/admin/slug.ts), made unique with -2, -3…
//     (falls back to the manifest's suggested_slug only if that generator cannot be loaded);
//   * images go to the public product-images bucket as products/<uuid>.<ext>, like requestProductImageUpload,
//     and are stored on products.images (the schema has no image↔colour link, so the order is black, pink, white);
//   * one price per colour in product_colors (all three colours on every apron), base_price = the lowest one;
//   * regular product: pieces_count 1, not DIY, published.
// Idempotent: a product with the same name in the same category is skipped (and its images are not uploaded).
// One failure does not stop the rest; a failed product is rolled back (row + uploaded images).
// The service key is read from the environment only and is never printed or written anywhere.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const dirArg = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : null;
const ROOT = dirArg ?? ["aprons-import", "aprons-import/aprons-import"].find((d) => fs.existsSync(path.join(d, "manifest.json")));
if (!ROOT || !fs.existsSync(path.join(ROOT, "manifest.json"))) {
  console.error("manifest.json not found (looked in aprons-import/ and aprons-import/aprons-import/). Use --dir <folder>.");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. Run with: node --env-file=.env.local scripts/import-aprons.mjs");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const BUCKET = "product-images";
const COLOR_ORDER = ["black", "pink", "white"]; // image order (the first image is the main one)
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TYPES = { ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // same cap as the admin (PRODUCT_IMAGE_MAX)

// the admin's slug generator (Node 22 runs the .ts file directly: it only uses erasable type syntax)
let adminSlug = null;
try {
  const m = await import("../src/lib/admin/slug.ts");
  adminSlug = { catalogSlug: m.catalogSlug, slugWithSuffix: m.slugWithSuffix };
} catch (e) {
  console.warn(`! admin slug generator not loadable (${e.message}); using suggested_slug from the manifest`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const kb = (b) => `${Math.round(b / 1024)} KB`;
const log = (...a) => console.log(...a);

// ---------------------------------------------------------------- shared lookups (read-only)
const { data: category, error: catErr } = await sb.from("categories").select("id, slug, name_ar, has_colors").eq("slug", manifest.category ?? "aprons").maybeSingle();
if (catErr || !category) {
  console.error(`category "${manifest.category}" not found${catErr ? `: ${catErr.message}` : ""}`);
  process.exit(1);
}
const { data: dbColors, error: colErr } = await sb.from("colors").select("id, name_ar, is_active");
if (colErr) {
  console.error(`colors: ${colErr.message}`);
  process.exit(1);
}
const colorPrice = Object.fromEntries((manifest.colors ?? []).map((c) => [c.key, Number(c.price)]));
for (const c of manifest.colors ?? []) {
  const db = dbColors.find((x) => x.id === c.key);
  if (!db || !db.is_active) {
    console.error(`colour "${c.key}" is not an active colour in the database`);
    process.exit(1);
  }
  if (!(colorPrice[c.key] >= 0)) {
    console.error(`colour "${c.key}" has no valid price`);
    process.exit(1);
  }
}

async function uniqueSlug(name, suggested) {
  let candidates;
  if (adminSlug) {
    const base = adminSlug.catalogSlug(name, "product");
    candidates = [base, ...Array.from({ length: 20 }, (_, i) => adminSlug.slugWithSuffix(base, "product", String(i + 2)))];
  } else {
    candidates = [suggested, ...Array.from({ length: 20 }, (_, i) => `${suggested}-${i + 2}`)];
  }
  candidates = candidates.filter((s) => s && SLUG_RE.test(s));
  const { data, error } = await sb.from("products").select("slug").in("slug", candidates);
  if (error) throw new Error(`slug lookup: ${error.message}`);
  const taken = new Set((data ?? []).map((r) => r.slug));
  const slug = candidates.find((s) => !taken.has(s));
  if (!slug) throw new Error("no free slug");
  return slug;
}

const summary = { added: [], skipped: [], failed: [] };
log(`${DRY ? "DRY RUN — nothing will be written" : "IMPORT"} · ${manifest.products.length} products → ${category.name_ar} (${category.slug}) · manifest: ${ROOT}`);
log(`prices: ${Object.entries(colorPrice).map(([k, v]) => `${k} ${v}`).join(", ")}\n`);

for (const p of manifest.products) {
  const label = `«${p.name}»`;
  const uploaded = []; // storage paths, removed again if this product fails
  let productId = null;
  try {
    // ---- idempotency: same name in the same category -> skip (no image upload either)
    const { data: existing, error: exErr } = await sb.from("products").select("id, slug").eq("category_id", category.id).eq("name_ar", p.name).limit(1);
    if (exErr) throw new Error(`existing check: ${exErr.message}`);
    if (existing?.length) {
      log(`= ${label} already exists (/products/${existing[0].slug}) — skipped`);
      summary.skipped.push(p.name);
      continue;
    }

    // ---- validate the local images before touching anything
    const images = [...(p.images ?? [])].sort((a, b) => COLOR_ORDER.indexOf(a.color) - COLOR_ORDER.indexOf(b.color));
    if (images.length === 0) throw new Error("no images in the manifest");
    const files = images.map((img) => {
      const file = path.join(ROOT, img.file);
      if (!fs.existsSync(file)) throw new Error(`missing image ${img.file}`);
      const type = TYPES[path.extname(file).toLowerCase()];
      if (!type) throw new Error(`unsupported image type ${img.file}`);
      const size = fs.statSync(file).size;
      if (size > MAX_IMAGE_BYTES) throw new Error(`${img.file} is over 5 MB`);
      return { ...img, abs: file, type, size, ext: path.extname(file).slice(1).toLowerCase().replace("jpeg", "jpg") };
    });
    const colors = ["white", "black", "pink"].filter((c) => colorPrice[c] !== undefined); // all three on every apron
    const base = Math.min(...colors.map((c) => colorPrice[c]));
    const slug = await uniqueSlug(p.name, p.suggested_slug);

    log(`+ ${label} → /products/${slug}`);
    log(`    colours: ${colors.map((c) => `${c} ${colorPrice[c]}`).join(", ")} (base_price ${base})`);
    log(`    images (${files.length}): ${files.map((f) => `${f.color} ${kb(f.size)}`).join(", ")}`);
    if (DRY) {
      summary.added.push(`${p.name} (dry run)`);
      continue;
    }

    // ---- 1) images -> product-images/products/<uuid>.<ext> (the admin's convention)
    const productImages = [];
    for (const f of files) {
      const objectPath = `products/${randomUUID()}.${f.ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(objectPath, fs.readFileSync(f.abs), { contentType: f.type, upsert: false, cacheControl: "31536000" });
      if (error) throw new Error(`upload ${f.file}: ${error.message}`);
      uploaded.push(objectPath);
      const colorName = dbColors.find((c) => c.id === f.color)?.name_ar ?? f.color;
      productImages.push({ src: sb.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl, alt: `${p.name} — ${colorName}`, position: "center" });
    }

    // ---- 2) the product row (regular, published), like saveProduct
    const { data: row, error: insErr } = await sb
      .from("products")
      .insert({
        slug,
        name_ar: p.name,
        category_id: category.id,
        description_ar: manifest.description ?? "",
        details_ar: "",
        care_ar: manifest.care ?? "",
        base_price: base,
        discount_percent: null,
        images: productImages,
        is_active: true,
        is_diy: false,
        pieces_count: 1,
        piece_labels: null,
        sort: 0,
      })
      .select("id, slug")
      .single();
    if (insErr) throw new Error(`insert: ${insErr.message}`);
    productId = row.id;

    // ---- 3) one price per colour (the insert trigger already added every colour at base_price)
    const { error: pcErr } = await sb
      .from("product_colors")
      .upsert(colors.map((c) => ({ product_id: productId, color_id: c, price: colorPrice[c], is_available: true })), { onConflict: "product_id,color_id" });
    if (pcErr) throw new Error(`colour prices: ${pcErr.message}`);
    const { data: check } = await sb.from("product_colors").select("color_id, price, is_available").eq("product_id", productId);
    const ok = colors.every((c) => check?.some((r) => r.color_id === c && Number(r.price) === colorPrice[c] && r.is_available));
    if (!ok) throw new Error("colour prices did not save as expected");

    log(`    ✓ added (${uploaded.length} images uploaded)`);
    summary.added.push(p.name);
  } catch (e) {
    console.error(`✗ ${label} failed: ${e.message}`);
    // roll back this product so a re-run can try again cleanly
    if (productId) await sb.from("products").delete().eq("id", productId);
    if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded);
    summary.failed.push(p.name);
  }
}

log(`\nsummary${DRY ? " (dry run)" : ""}: added ${summary.added.length} · skipped ${summary.skipped.length} · failed ${summary.failed.length}`);
if (summary.skipped.length) log(`  skipped: ${summary.skipped.join("، ")}`);
if (summary.failed.length) log(`  failed: ${summary.failed.join("، ")}`);
if (!DRY && summary.added.length) {
  log("\nThe live site caches the catalog: see the reply for how to refresh it (admin save on one of the new aprons, or the deploy).");
}
process.exitCode = summary.failed.length ? 1 : 0;
