// Proves, against the REAL project, that only admins can read orders and customer uploads.
//   node --env-file=.env.local scripts/verify-admin.mjs admin@fatma.com
// It signs in WITHOUT a password (one-time magic-link token issued with the secret key), so it never
// needs or changes the admin password. Creates then deletes: 1 order, 1 upload, 1 temporary non-admin user.
import { createClient } from "@supabase/supabase-js";

const adminEmail = process.argv[2];
if (!adminEmail) throw new Error("usage: verify-admin.mjs <admin email>");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, process.env.SUPABASE_SECRET_KEY, opts);
const anon = createClient(url, pub, opts);

let failed = 0;
const check = (name, pass, extra = "") => {
  if (!pass) failed++;
  console.log(pass ? "PASS" : "FAIL", name, pass ? "" : extra);
};

async function sessionFor(email) {
  const link = await service.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const client = createClient(url, pub, opts);
  const v = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
  if (v.error) throw v.error;
  return { client, userId: v.data.user.id };
}

// ---- fixtures
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const path = `uploads/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.png`;
const up = await service.storage.from("designs").upload(path, PNG, { contentType: "image/png" });
if (up.error) throw up.error;
const productId = (await service.from("products").select("id").eq("slug", "chef-apron").single()).data.id;
const order = await service.rpc("create_order", {
  p_order: { customer_name: "Admin Verify", phone: "01000000000", governorate: "القاهرة", area: "x", address: "verify", notes: "", payment_method: "cod", subtotal: 125, shipping: 0, total: 125 },
  p_items: [{ product_id: productId, name_snapshot: "verify", mode: "design", design_path: path, unit_price: 125, qty: 1 }],
});
if (order.error) throw order.error;
const orderId = order.data.id;
await service.from("newsletter_subscribers").delete().eq("email", "verify-admin@example.com");
const sub = await service.from("newsletter_subscribers").insert({ email: "verify-admin@example.com" });
if (sub.error) throw sub.error;

let tempUserId = null;
try {
  // ---- anonymous
  const aOrders = await anon.from("orders").select("id").eq("id", orderId);
  check("ANON cannot read the order", !!aOrders.error || (aOrders.data ?? []).length === 0);
  const aItems = await anon.from("order_items").select("id").eq("order_id", orderId);
  check("ANON cannot read its items", !!aItems.error || (aItems.data ?? []).length === 0);
  const aSub = await anon.from("newsletter_subscribers").select("id").limit(1);
  check("ANON cannot read subscribers", !!aSub.error || (aSub.data ?? []).length === 0);
  const aSign = await anon.storage.from("designs").createSignedUrl(path, 60);
  check("ANON cannot sign the customer upload", !!aSign.error || !aSign.data?.signedUrl, JSON.stringify(aSign.data));
  const aList = await anon.storage.from("designs").list(path.slice(0, path.lastIndexOf("/")));
  check("ANON cannot list the designs bucket", !!aList.error || (aList.data ?? []).length === 0);
  const aPub = await fetch(`${url}/storage/v1/object/public/designs/${path}`);
  check("upload is not reachable through a public URL", !aPub.ok);

  // ---- signed-in but NOT admin
  const tmpEmail = `not-admin-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const created = await service.auth.admin.createUser({ email: tmpEmail, email_confirm: true });
  if (created.error) throw created.error;
  tempUserId = created.data.user.id;
  const u = await sessionFor(tmpEmail);
  const uAdmin = await u.client.rpc("is_admin");
  check("signed-in non-admin: is_admin() = false", uAdmin.data === false, JSON.stringify(uAdmin));
  const uOrders = await u.client.from("orders").select("id").eq("id", orderId);
  check("signed-in NON-ADMIN cannot read the order", !!uOrders.error || (uOrders.data ?? []).length === 0);
  const uSign = await u.client.storage.from("designs").createSignedUrl(path, 60);
  check("signed-in NON-ADMIN cannot sign the upload", !!uSign.error || !uSign.data?.signedUrl);
  const uUpd = await u.client.from("orders").update({ status: "cancelled" }).eq("id", orderId).select();
  check("signed-in NON-ADMIN cannot change order status", !!uUpd.error || (uUpd.data ?? []).length === 0);
  const uProd = await u.client.from("products").update({ base_price: 1 }).eq("slug", "chef-apron").select();
  check("signed-in NON-ADMIN cannot edit products", !!uProd.error || (uProd.data ?? []).length === 0);

  // ---- the admin
  const a = await sessionFor(adminEmail);
  const isAdmin = await a.client.rpc("is_admin");
  check(`${adminEmail}: is_admin() = true`, isAdmin.data === true, JSON.stringify(isAdmin));
  const o = await a.client.from("orders").select("*, order_items(*)").eq("id", orderId).single();
  check("ADMIN can read the order with its items", !o.error && o.data?.order_items?.length === 1, o.error?.message);
  const signed = await a.client.storage.from("designs").createSignedUrl(path, 60);
  check("ADMIN can create a signed URL for the customer upload", !signed.error && !!signed.data?.signedUrl, signed.error?.message);
  if (signed.data?.signedUrl) {
    const dl = await fetch(signed.data.signedUrl);
    check("…and that URL downloads the exact file", dl.ok && Buffer.from(await dl.arrayBuffer()).equals(PNG));
  }
  const subs = await a.client.from("newsletter_subscribers").select("email").limit(5);
  check("ADMIN can read newsletter subscribers", !subs.error && (subs.data ?? []).length >= 1, subs.error?.message);
  const upd = await a.client.from("orders").update({ status: "confirmed" }).eq("id", orderId).select("status");
  check("ADMIN can update order status", !upd.error && upd.data?.[0]?.status === "confirmed", upd.error?.message);
  const bad = await a.client.from("orders").update({ status: "lost" }).eq("id", orderId);
  check("invalid status is rejected by the database", !!bad.error);
  const del = await a.client.from("orders").delete().eq("id", orderId).select();
  check("ADMIN cannot delete orders through the API (no policy)", !!del.error || (del.data ?? []).length === 0);
  const prod = await a.client.from("shipping_rates").update({ fee: null }).eq("governorate", "القاهرة").select();
  check("ADMIN can edit shipping rates", !prod.error && (prod.data ?? []).length === 1, prod.error?.message);
} finally {
  await service.from("orders").delete().eq("id", orderId);
  await service.storage.from("designs").remove([path]);
  await service.from("newsletter_subscribers").delete().eq("email", "verify-admin@example.com");
  if (tempUserId) await service.auth.admin.deleteUser(tempUserId);
  console.log("INFO  cleaned up test order, upload, subscriber and temporary user");
}
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll admin/anonymous access checks passed");
process.exit(failed ? 1 : 0);
