// Smoke-tests your REAL Supabase project after `supabase db push`:
//   npm run verify:supabase
// Optional: set VERIFY_ADMIN_EMAIL / VERIFY_ADMIN_PASSWORD (inline, not in .env.local) to also test the admin.
// It creates and deletes one test order and one test upload (nothing else is modified).
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !pub || !secret) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY in .env.local");
  process.exit(2);
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = createClient(url, pub, opts);
const service = createClient(url, secret, opts);

let failed = 0;
const check = (name, pass, extra = "") => {
  if (!pass) failed++;
  console.log(pass ? "PASS" : "FAIL", name, pass ? "" : extra);
};

// 1. schema + seed + public reads
const cats = await anon.from("categories").select("slug");
check("anon can read categories", !cats.error && (cats.data?.length ?? 0) >= 3, cats.error?.message);
const prods = await anon.from("products").select("slug, base_price");
check("anon can read active products", !prods.error && (prods.data?.length ?? 0) >= 3, prods.error?.message);
const rates = await anon.from("shipping_rates").select("governorate, fee");
check("27 governorates in shipping_rates", !rates.error && rates.data?.length === 27, `${rates.data?.length} ${rates.error?.message ?? ""}`);
const unset = (rates.data ?? []).filter((r) => r.fee === null).length;
console.log(`INFO  shipping fees set for ${27 - unset}/27 governorates (checkout only accepts governorates with a fee)`);

// 2. anonymous visitors are locked out of private data
for (const t of ["orders", "order_items", "newsletter_subscribers", "admins"]) {
  const r = await anon.from(t).select("*").limit(1);
  check(`anon cannot read ${t}`, !!r.error || (r.data ?? []).length === 0, "rows were returned!");
}
const ins = await anon.from("orders").insert({ customer_name: "x y", phone: "01012345678", governorate: "القاهرة", area: "a", address: "abc", subtotal: 1, shipping: 1, total: 2 });
check("anon cannot insert orders", !!ins.error, "insert succeeded!");
const nl = await anon.from("newsletter_subscribers").insert({ email: "probe@example.com" });
check("anon cannot insert subscribers directly", !!nl.error, "insert succeeded!");
const rpc = await anon.rpc("create_order", { p_order: {}, p_items: [] });
check("anon cannot call create_order", !!rpc.error, "call succeeded!");
const upd = await anon.from("products").update({ base_price: 1 }).eq("slug", "chef-apron").select();
check("anon cannot edit products", !!upd.error || (upd.data ?? []).length === 0, "update affected rows!");

// 3. buckets
const buckets = await service.storage.listBuckets();
const designs = buckets.data?.find((b) => b.id === "designs");
const images = buckets.data?.find((b) => b.id === "product-images");
check("bucket `designs` exists and is PRIVATE", !!designs && designs.public === false, JSON.stringify(designs));
check("bucket `product-images` exists and is public", !!images && images.public === true, JSON.stringify(images));

// 4. upload protocol used by the product page (signed upload URL + raw PUT with progress-capable XHR)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const path = `uploads/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.png`;
const signedUp = await service.storage.from("designs").createSignedUploadUrl(path);
check("server can issue a signed upload URL", !signedUp.error, signedUp.error?.message);
if (!signedUp.error) {
  const put = await fetch(signedUp.data.signedUrl, {
    method: "PUT",
    headers: { apikey: pub, "content-type": "image/png", "cache-control": "max-age=3600", "x-upsert": "false" },
    body: PNG,
  });
  check("browser-style PUT to the signed URL works", put.ok, `${put.status} ${await put.text()}`);
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const listed = await service.storage.from("designs").list(dir, { search: name });
  const obj = listed.data?.find((o) => o.name === name);
  check("object is visible to the server with size + mimetype", !!obj && obj.metadata?.mimetype === "image/png" && obj.metadata?.size === PNG.length, JSON.stringify(obj?.metadata));

  const pubUrl = `${url}/storage/v1/object/public/designs/${path}`;
  const pubRes = await fetch(pubUrl);
  check("private upload is NOT reachable via a public URL", !pubRes.ok, `status ${pubRes.status}`);
  const anonSign = await anon.storage.from("designs").createSignedUrl(path, 60);
  check("anon cannot create a signed URL for it", !!anonSign.error || !anonSign.data?.signedUrl, "anon got a URL!");
  const sign = await service.storage.from("designs").createSignedUrl(path, 60);
  const dl = sign.data ? await fetch(sign.data.signedUrl) : null;
  check("server-issued signed URL downloads it", !!dl?.ok, `${dl?.status}`);

  const big = await service.storage.from("designs").createSignedUploadUrl(`uploads/x/${crypto.randomUUID()}.gif`);
  if (!big.error) {
    const bad = await fetch(big.data.signedUrl, { method: "PUT", headers: { apikey: pub, "content-type": "image/gif", "x-upsert": "false" }, body: PNG });
    check("bucket rejects non-image mime types", !bad.ok, `status ${bad.status}`);
  }

  // 5. admin (optional)
  const email = process.env.VERIFY_ADMIN_EMAIL;
  const password = process.env.VERIFY_ADMIN_PASSWORD;
  if (email && password) {
    const adminClient = createClient(url, pub, opts);
    const signin = await adminClient.auth.signInWithPassword({ email, password });
    check("admin can sign in", !signin.error, signin.error?.message);
    if (!signin.error) {
      const isAdmin = await adminClient.rpc("is_admin");
      check("is_admin() is true for that user", isAdmin.data === true, JSON.stringify(isAdmin));
      const o = await adminClient.from("orders").select("id").limit(1);
      check("admin can read orders", !o.error, o.error?.message);
      const s = await adminClient.storage.from("designs").createSignedUrl(path, 60);
      check("admin can sign customer uploads (storage policy)", !s.error && !!s.data?.signedUrl, s.error?.message);
    }
  } else {
    console.log("INFO  admin checks skipped (set VERIFY_ADMIN_EMAIL / VERIFY_ADMIN_PASSWORD to include them)");
  }

  await service.storage.from("designs").remove([path]);
}

// 6. create_order RPC (service role only) — create then delete a throw-away order
const probe = await service.rpc("create_order", {
  p_order: { customer_name: "Verify Script", phone: "01000000000", governorate: "القاهرة", area: "x", address: "verify", notes: "", payment_method: "cod", subtotal: 100, shipping: 0, total: 100 },
  p_items: [{ product_id: prods.data ? (await service.from("products").select("id").eq("slug", "chef-apron").single()).data?.id : null, name_snapshot: "verify", mode: "standard", unit_price: 100, qty: 1 }],
});
check("create_order works for the service role", !probe.error && !!probe.data?.id, probe.error?.message);
if (probe.data?.id) {
  const items = await service.from("order_items").select("id").eq("order_id", probe.data.id);
  check("…and wrote its items", (items.data?.length ?? 0) === 1);
  await service.from("orders").delete().eq("id", probe.data.id);
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
