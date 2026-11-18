// Real checkout/Storage/admin verification. Creates only tagged test orders and a temporary admin;
// removes those records and receipts in finally. Requires a running local app and .env.local.
// node --env-file=.env.local scripts/verify-product-order-rules.mjs http://localhost:3111
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3111";
const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, process.env.SUPABASE_SECRET_KEY, options);
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options);
const tag = crypto.randomUUID();
const customerName = `ORDER RULES TEST ${tag}`;
const email = `deposit-${tag.slice(0, 8)}@example.com`;
const password = `Test-${crypto.randomUUID()}`;
const out = "shots-deposit";
let userId;
let browser;
const receipts = new Set();
const ok = (message) => console.log(`PASS ${message}`);
const dataOrThrow = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
await fs.mkdir(out, { recursive: true });

try {
  const products = dataOrThrow(await service.from("products")
    .select("id, slug, name_ar, base_price, discount_percent, personalization_fee, category:categories!inner(slug, is_active)")
    .eq("is_active", true).eq("category.is_active", true));
  const product = (category) => {
    const found = products.find((p) => p.category.slug === category);
    assert.ok(found, `An active ${category} product is required`);
    return found;
  };
  const apron = product("aprons"), towel = product("towels"), bag = product("bags");
  const rates = dataOrThrow(await service.from("shipping_rates").select("governorate, fee").not("fee", "is", null));
  assert.ok(rates.length, "An existing configured shipping rate is required");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await customer.newPage();
  page.setDefaultTimeout(30000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  async function add(p, color, name) {
    await page.goto(`${base}/products/${p.slug}`);
    await page.getByRole("heading", { name: p.name_ar, exact: true }).waitFor();
    if (color) {
      assert.deepEqual(await page.locator("#product-color option").allTextContents(), ["Black", "White", "Pink"]);
      await page.locator("#product-color").selectOption(color);
      if (name) {
        await page.getByRole("button", { name: /اكتب اسمك عليه/ }).click();
        await page.locator("#nm").fill(name);
      }
      assert.equal(await page.locator(".fonts").count(), 0);
    } else {
      assert.equal(await page.locator("#product-color, #nm, .fonts, .info .opt").count(), 0);
    }
    await page.locator(".info").getByRole("button", { name: "أضف للسلة", exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("fatma-cart") || "{}").state?.lines?.length > 0);
  }
  async function fillCheckout() {
    await page.goto(`${base}/checkout`);
    await page.locator('[name="name"]').fill(customerName);
    await page.locator('[name="phone"]').fill("01012349999");
    await page.locator('[name="governorate"]').selectOption(rates[0].governorate);
    await page.locator('[name="area"]').fill("منطقة اختبار");
    await page.locator('[name="address"]').fill("TEST ONLY — شارع الاختبار، عمارة ١، الدور ٢، شقة ٣");
  }
  await add(apron, "pink", "فاطمة");
  await add(towel, "white");
  await add(bag);
  await fillCheckout();
  const submit = page.getByRole("button", { name: "إرسال الطلب لمراجعة العربون", exact: true });
  assert.equal(await submit.isDisabled(), true);
  const note = `Make text smaller — TEST ${tag}`;
  await page.locator("#customization-notes").fill(note);
  await page.locator("#deposit-method").selectOption("wallet");
  const receiptPage = await customer.newPage();
  await receiptPage.setContent('<html><body style="font:24px sans-serif;background:white;padding:40px"><h1>TEST ONLY</h1><p>Automated deposit upload verification. No payment made.</p></body></html>');
  const png = await receiptPage.screenshot();
  await receiptPage.close();
  await page.locator("#payment-proof").setInputFiles({ name: "TEST-ONLY-receipt.png", mimeType: "image/png", buffer: png });
  await page.getByText("تم رفع إثبات التحويل. العربون في انتظار مراجعة الإدارة.", { exact: true }).waitFor();
  assert.equal(await submit.isEnabled(), true);
  await page.screenshot({ path: `${out}/checkout-mobile.png`, fullPage: true });
  await submit.click();
  await page.waitForURL(/\/order\/[0-9a-f-]+$/, { timeout: 60000 });
  const id = page.url().split("/").pop();
  const order = dataOrThrow(await service.from("orders").select("*, order_items(*)").eq("id", id).single());
  receipts.add(order.payment_proof_path);
  assert.equal(order.customer_name, customerName);
  assert.equal(order.deposit_status, "submitted");
  assert.equal(order.deposit_method, "wallet");
  assert.equal(order.deposit_confirmed_at, null);
  assert.equal(order.customization_notes, note);
  assert.equal(Number(order.deposit_amount), Math.round(Number(order.total) * 30) / 100);
  assert.equal(order.order_items.length, 3);
  assert.ok(order.order_items.some((i) => i.product_id === apron.id && i.color === "pink" && i.font === null));
  assert.ok(order.order_items.some((i) => i.product_id === towel.id && i.color === "white"));
  assert.ok(order.order_items.some((i) => i.product_id === bag.id && i.mode === "standard" && i.color === null));
  await page.reload();
  await page.getByText(/Deposit Submitted/).waitFor();
  assert.ok((await page.locator("body").textContent()).includes(note));
  assert.equal(await page.locator(".order-product-image").evaluateAll((images) => images.filter((img) => img.tagName === "IMG" && (!img.complete || !img.naturalWidth)).length), 0);
  ok("real mixed-cart checkout persists colors, notes, prices, receipt and unverified deposit after reload");
  const downloaded = dataOrThrow(await service.storage.from("payment-proofs").download(order.payment_proof_path));
  assert.equal(downloaded.size, png.length);
  assert.equal((await fetch(`${url}/storage/v1/object/public/payment-proofs/${order.payment_proof_path}`)).ok, false);
  const denied = await anon.storage.from("payment-proofs").createSignedUrl(order.payment_proof_path, 60);
  assert.ok(denied.error || !denied.data?.signedUrl);
  const gate = await service.from("orders").update({ status: "prepared" }).eq("id", id);
  assert.match(gate.error?.message ?? "", /verify deposit/);
  ok("uploaded image exists privately and the database blocks fulfillment before verification");

  const user = dataOrThrow(await service.auth.admin.createUser({ email, password, email_confirm: true }));
  userId = user.user.id;
  dataOrThrow(await service.rpc("grant_admin", { p_email: email }));
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const admin = await adminContext.newPage();
  await admin.goto(`${base}/admin/login`);
  await admin.locator("#email").fill(email);
  await admin.locator("#password").fill(password);
  await admin.getByRole("button", { name: "دخول", exact: true }).click();
  await admin.waitForURL(/\/admin$/, { timeout: 60000 });
  await admin.goto(`${base}/admin/orders/${id}`);
  await admin.getByRole("heading", { name: "العربون", exact: true }).waitFor();
  const proof = admin.getByRole("img", { name: "إثبات تحويل العربون", exact: true });
  await proof.waitFor();
  await proof.evaluate((img) => img.decode());
  const signedUrl = await proof.getAttribute("src");
  assert.equal((await fetch(signedUrl)).ok, true);
  assert.ok((await admin.locator(".adm-order-screen").textContent()).includes(note));
  await admin.getByRole("button", { name: "تأكيد استلام العربون", exact: true }).click();
  await admin.locator(".adm-order-screen").getByText(/Deposit Confirmed/).waitFor();
  const verified = dataOrThrow(await service.from("orders").select("deposit_status,deposit_confirmed_by,deposit_confirmed_at").eq("id", id).single());
  assert.equal(verified.deposit_status, "confirmed");
  assert.equal(verified.deposit_confirmed_by, userId);
  assert.ok(verified.deposit_confirmed_at);
  await admin.reload();
  await admin.locator(".adm-order-screen").getByText(/Deposit Confirmed/).waitFor();
  const invoice = await admin.locator(".adm-invoice").textContent();
  assert.ok(invoice.includes(note) && invoice.includes("Pink") && invoice.includes("Deposit Confirmed"));
  await admin.screenshot({ path: `${out}/admin-deposit-desktop.png`, fullPage: true });
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.screenshot({ path: `${out}/admin-deposit-mobile.png`, fullPage: true });
  assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth), JSON.stringify(await admin.evaluate(() => [...document.querySelectorAll(".adm-order-screen *")].filter((el) => el.getBoundingClientRect().right > innerWidth || el.getBoundingClientRect().left < 0).slice(0, 12).map((el) => ({ tag: el.tagName, class: el.className, text: el.textContent?.slice(0, 60), width: el.getBoundingClientRect().width })))));
  await admin.emulateMedia({ media: "print" });
  await admin.pdf({ path: `${out}/invoice.pdf`, format: "A4", printBackground: true });
  ok("admin sees receipt and notes, confirmation persists, and the invoice includes color and payment details");

  await add(bag);
  await fillCheckout();
  assert.equal(await page.locator("#payment-proof, #customization-notes, #deposit-method").count(), 0);
  await page.getByRole("button", { name: "تأكيد الطلب", exact: true }).click();
  await page.waitForURL(/\/order\/[0-9a-f-]+$/, { timeout: 60000 });
  const normal = dataOrThrow(await service.from("orders").select("deposit_status,deposit_amount,customization_notes,payment_proof_path").eq("id", page.url().split("/").pop()).single());
  assert.deepEqual(normal, { deposit_status: null, deposit_amount: 0, customization_notes: null, payment_proof_path: null });
  assert.deepEqual(pageErrors, []);
  ok("bag-only checkout stays normal and requires no customization or deposit");
} finally {
  await browser?.close();
  const ownOrders = dataOrThrow(await service.from("orders").select("id,payment_proof_path").eq("customer_name", customerName));
  for (const order of ownOrders) {
    if (order.payment_proof_path) receipts.add(order.payment_proof_path);
    dataOrThrow(await service.from("orders").delete().eq("id", order.id));
  }
  if (receipts.size) dataOrThrow(await service.storage.from("payment-proofs").remove([...receipts]));
  if (userId) dataOrThrow(await service.auth.admin.deleteUser(userId));
  console.log("CLEANUP removed tagged test orders, receipts, and temporary admin");
}
