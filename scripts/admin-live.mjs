// REAL end-to-end test of the admin console against your Supabase project + a running production server.
//   node --env-file=.env.local scripts/admin-live.mjs [base]
// It creates a temporary admin (known password) and a temporary non-admin, signs in through the real login form,
// exercises every admin screen, checks that storefront changes appear immediately, and cleans everything up.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3111";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const sb = createClient(url, process.env.SUPABASE_SECRET_KEY, opts);

let failed = 0;
const check = (name, pass, extra = "") => {
  if (!pass) failed++;
  console.log(pass ? "PASS" : "FAIL", name, pass ? "" : extra);
};
const CART = JSON.stringify({ state: { lines: [{ key: "chef-apron|standard|||", productId: "chef-apron", mode: "standard", text: null, font: null, designPath: null, designName: null, qty: 1 }] }, version: 1 });
async function checkoutOptions(browser, base) {
  const c = await browser.newContext();
  await c.addInitScript((v) => localStorage.setItem("fatma-cart", v), CART);
  const p = await c.newPage();
  await p.goto(base + "/checkout", { waitUntil: "load" });
  await p.waitForSelector('select[name="governorate"]');
  const opts = await p.locator("select option").evaluateAll((os) => Object.fromEntries(os.map((o) => [o.value, !o.disabled])));
  await c.close();
  return opts;
}
const html = async (path) => (await fetch(base + path, { redirect: "manual" })).text();
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const tag = crypto.randomUUID().slice(0, 6);
const cleanup = { users: [], orders: [], objects: [], products: [], categories: [] };

// ---------------------------------------------------------------- fixtures
const adminEmail = `e2e-admin-${tag}@example.com`, adminPw = `Pw-${crypto.randomUUID()}`;
const plainEmail = `e2e-user-${tag}@example.com`, plainPw = `Pw-${crypto.randomUUID()}`;
for (const [email, password] of [[adminEmail, adminPw], [plainEmail, plainPw]]) {
  const u = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (u.error) throw u.error;
  cleanup.users.push(u.data.user.id);
}
await sb.rpc("grant_admin", { p_email: adminEmail });

const designPath = `uploads/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.png`;
await sb.storage.from("designs").upload(designPath, PNG, { contentType: "image/png" });
cleanup.objects.push(["designs", designPath]);
const apronRow = (await sb.from("products").select("id, base_price, personalization_fee").eq("slug", "chef-apron").single()).data;
const apronId = apronRow.id;
const mkOrder = async (name, phone, items, gov = "الجيزة") => {
  const r = await sb.rpc("create_order", {
    p_order: { customer_name: name, phone, governorate: gov, area: "المنطقة", address: "عنوان الاختبار 123", notes: "ملاحظة اختبار", payment_method: "cod", subtotal: 125, shipping: 0, total: 125 },
    p_items: items,
  });
  if (r.error) throw r.error;
  cleanup.orders.push(r.data.id);
  return r.data;
};
const o1 = await mkOrder(`ADMINTEST ${tag} فاطمة`, "01011112222", [
  { product_id: apronId, name_snapshot: "مريلة مطبخ Chef", mode: "name", text: "فاطمة", font: "naskh", unit_price: 125, qty: 1 },
  { product_id: apronId, name_snapshot: "مريلة مطبخ Chef", mode: "design", design_path: designPath, unit_price: 125, qty: 2 },
]);
const o2 = await mkOrder(`ADMINTEST ${tag} Sara`, "01233334444", [{ product_id: apronId, name_snapshot: "مريلة مطبخ Chef", mode: "standard", unit_price: 100, qty: 1 }]);
await sb.from("orders").update({ status: "shipped" }).eq("id", o2.id);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const saveBtn = () => vis('button:text-is("حفظ")');
const save = async () => {
  await saveBtn().click();
  await page.waitForTimeout(400);
  await page.waitForFunction(() => ![...document.querySelectorAll("button[type=submit]")].some((b) => b.disabled && b.offsetParent !== null), null, { timeout: 20000 });
};
const vis = (s) => page.locator(`${s} >> visible=true`);

try {
  // ---------------------------------------------------------------- access control
  await page.goto(base + "/admin/orders", { waitUntil: "load" });
  check("anonymous /admin/orders redirects to the login page", page.url().includes("/admin/login"), page.url());
  const anonExport = await fetch(base + "/admin/subscribers/export", { redirect: "manual" });
  check("anonymous CSV export is refused (redirect/401)", anonExport.status === 401 || anonExport.status === 307 || anonExport.status === 308, String(anonExport.status));
  const anonHdr = await fetch(base + "/admin/login");
  check("admin responses are noindex + no-store", /noindex/.test(anonHdr.headers.get("x-robots-tag") ?? "") && /no-store/.test(anonHdr.headers.get("cache-control") ?? ""));

  const login = async (email, pw) => {
    await page.goto(base + "/admin/login", { waitUntil: "load" });
    await vis("#email").fill(email);
    await vis("#password").fill(pw);
    await page.getByRole("button", { name: "دخول" }).click();
  };
  await login(adminEmail, "wrong-password");
  await page.locator(".adm-err").waitFor();
  check("wrong password -> generic Arabic error", ((await page.locator(".adm-err").textContent()) ?? "").includes("غلط"));
  await login(plainEmail, plainPw);
  await page.locator(".adm-err").waitFor();
  check("valid account that is NOT an admin is refused", ((await page.locator(".adm-err").textContent()) ?? "").includes("مش مسموح"));
  await page.goto(base + "/admin/orders", { waitUntil: "load" });
  check("…and still cannot open /admin/orders", page.url().includes("/admin/login"));

  await login(adminEmail, adminPw);
  await page.waitForURL(/\/admin$/, { timeout: 20000 });
  check("admin logs in and lands on the dashboard", (await vis("h1").first().textContent())?.includes("الرئيسية"));
  check("dashboard warns about governorates without shipping fees", ((await page.locator(".adm-alert").textContent()) ?? "").includes("27"));

  // header account icon: a real link, signed-in admins go straight to /admin
  await page.goto(base + "/", { waitUntil: "load" });
  const acct = page.locator('a[aria-label="حسابي"] >> visible=true').first();
  check("header account icon is an <a href=/admin/login>", (await acct.getAttribute("href")) === "/admin/login");
  await acct.click();
  await page.waitForURL((u) => u.pathname === "/admin", { timeout: 20000 });
  check("signed-in admin clicking the account icon lands on /admin", page.url().endsWith("/admin"));

  // ---------------------------------------------------------------- orders
  await vis('.adm-nav a:has-text("الطلبات")').click();
  await page.waitForURL(/\/admin\/orders/);
  await page.getByText(`#${o1.number}`).first().waitFor();
  check("orders list shows both test orders", (await page.getByText(`ADMINTEST ${tag}`).count()) >= 2);

  await page.goto(base + `/admin/orders?status=shipped`, { waitUntil: "load" });
  await page.getByText(`#${o2.number}`).first().waitFor();
  check("status filter: shipped shows only the shipped order", (await page.getByText(`#${o1.number}`).count()) === 0 && (await page.getByText(`#${o2.number}`).count()) >= 1);
  await page.goto(base + `/admin/orders?q=${encodeURIComponent("01011112222")}`, { waitUntil: "load" });
  await page.getByText(`#${o1.number}`).first().waitFor();
  check("search by phone", (await page.getByText(`#${o2.number}`).count()) === 0);
  await page.goto(base + `/admin/orders?q=${o2.number}`, { waitUntil: "load" });
  await page.getByText(`#${o2.number}`).first().waitFor();
  check("search by order number", (await page.getByText(`#${o1.number}`).count()) === 0, `o1=${o1.number} o2=${o2.number} rows=${(await page.locator("tbody tr").allTextContents()).map((t) => t.replace(/s+/g, " ").slice(0, 60)).join(" || ")}`);
  await page.goto(base + `/admin/orders?q=${encodeURIComponent("Sara")}&status=shipped`, { waitUntil: "load" });
  await page.getByText(`#${o2.number}`).first().waitFor();
  check("search by name + status combined", true);
  await page.goto(base + `/admin/orders?q=${encodeURIComponent("x%,status.eq.new),(")}`, { waitUntil: "load" });
  check("search text cannot break the query (no crash)", (await page.locator(".adm-alert").count()) === 0);

  // ---------------------------------------------------------------- order detail
  await page.goto(base + `/admin/orders/${o1.id}`, { waitUntil: "load" });
  await page.waitForSelector(".adm-nameprint");
  const ff = await page.locator(".adm-nameprint").evaluate((e) => getComputedStyle(e).fontFamily);
  check("name is rendered in the chosen font (نسخ → Amiri)", /Amiri/i.test(ff) && (await page.locator(".adm-nameprint").textContent()) === "فاطمة", ff);
  await page.waitForFunction(() => document.fonts.check("30px Amiri"), null, { timeout: 15000 }).catch(() => {});
  const bodyText = (await page.locator("body").textContent()) ?? "";
  check("customer details + COD shown (text)", ["ADMINTEST", "01011112222", "الجيزة", "عنوان الاختبار", "ملاحظة اختبار", "الدفع عند الاستلام"].every((t) => bodyText.includes(t)));
  await page.waitForFunction(() => { const i = document.querySelector(".design-img"); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 20000 }).catch(() => {});
  check("uploaded design is shown (signed URL)", await page.evaluate(() => { const i = document.querySelector(".design-img"); return !!i && i.src.includes("/object/sign/designs/") && i.naturalWidth > 0; }));
  const dlHref = await page.getByRole("link", { name: "تحميل الملف" }).getAttribute("href");
  const dl = await fetch(dlHref);
  check("download link serves the exact file as an attachment", dl.ok && /attachment/.test(dl.headers.get("content-disposition") ?? "") && Buffer.from(await dl.arrayBuffer()).equals(PNG), dl.headers.get("content-disposition") ?? "");

  await page.getByLabel("حالة الطلب").selectOption("prepared");
  await page.getByRole("button", { name: "حفظ الحالة" }).click();
  await page.getByText("اتحدّثت الحالة").waitFor();
  const st = (await sb.from("orders").select("status").eq("id", o1.id).single()).data.status;
  check("changing status saves to the database", st === "prepared", st);
  await page.reload({ waitUntil: "load" });
  check("…and the badge reflects it", ((await page.locator(".adm-badge").first().textContent()) ?? "").includes("اتجهز"));
  await page.goto(base + "/admin/orders", { waitUntil: "load" });
  const orderRow = page.locator("tbody tr").filter({ has: page.getByRole("link", { name: `#${o1.number}`, exact: true }) });
  await orderRow.getByLabel("حالة الطلب").selectOption("returned");
  const returnDialog = page.getByRole("dialog", { name: "إرجاع الطلب" });
  const returnSave = returnDialog.getByRole("button", { name: "حفظ الإرجاع" });
  await returnDialog.waitFor();
  check("return cannot be saved without a reason", await returnSave.isDisabled());
  await returnDialog.getByLabel("سبب الإرجاع").fill("المقاس غير مناسب");
  await returnSave.click();
  await returnDialog.waitFor({ state: "hidden" });
  await page.goto(base + "/admin/orders?status=returned", { waitUntil: "load" });
  await orderRow.locator('.adm-badge[data-s="returned"]').waitFor();
  await orderRow.getByRole("link", { name: `#${o1.number}`, exact: true }).click();
  await page.waitForURL(base + `/admin/orders/${o1.id}`);
  await page.reload({ waitUntil: "load" });
  await page.getByText("المقاس غير مناسب", { exact: true }).waitFor();
  const returned = (await sb.from("orders").select("status, return_reason").eq("id", o1.id).single()).data;
  check("return reason and status persist after reload", returned?.status === "returned" && returned.return_reason === "المقاس غير مناسب");
  await page.getByLabel("حالة الطلب").selectOption("delivered");
  await page.getByRole("button", { name: "حفظ الحالة" }).click();
  await page.getByText("اتحدّثت الحالة").waitFor();
  const delivered = (await sb.from("orders").select("status, return_reason").eq("id", o1.id).single()).data;
  check("leaving Returned clears the saved reason", delivered?.status === "delivered" && delivered.return_reason === null);

  // ---------------------------------------------------------------- shipping (+ storefront cache)
  await page.goto(base + "/admin/shipping", { waitUntil: "load" });
  const before = await checkoutOptions(browser, base);
  check("storefront: القاهرة and الجيزة are disabled before fees are set", before["القاهرة"] === false && before["الجيزة"] === false, JSON.stringify([before["القاهرة"], before["الجيزة"]]));
  await page.locator('input[name="fee:القاهرة"]').fill("55");
  await page.locator('input[name="fee:الجيزة"]').fill("٦٠"); // Arabic digits
  await page.getByRole("button", { name: "حفظ الأسعار" }).click();
  await page.getByText(/اتحفظت/).waitFor();
  const rates = (await sb.from("shipping_rates").select("governorate, fee").in("governorate", ["القاهرة", "الجيزة"])).data;
  check("shipping fees saved (55 and Arabic-digit 60)", rates.find((r) => r.governorate === "القاهرة")?.fee === 55 && rates.find((r) => r.governorate === "الجيزة")?.fee === 60, JSON.stringify(rates));
  const after = await checkoutOptions(browser, base);
  check("storefront checkout enables those governorates IMMEDIATELY (cache invalidated)", after["القاهرة"] === true && after["الجيزة"] === true && after["الإسكندرية"] === false, JSON.stringify([after["القاهرة"], after["الجيزة"], after["الإسكندرية"]]));
  await page.locator('input[name="fee:القاهرة"]').fill("abc");
  await page.getByRole("button", { name: "حفظ الأسعار" }).click();
  await page.getByText("في أسعار غير صحيحة").waitFor();
  check("invalid fee rejected, nothing saved", (await sb.from("shipping_rates").select("fee").eq("governorate", "القاهرة").single()).data.fee === 55);
  // revert both to "not available"
  await page.reload({ waitUntil: "load" });
  await page.locator('input[name="fee:القاهرة"]').fill("");
  await page.locator('input[name="fee:الجيزة"]').fill("");
  await page.getByRole("button", { name: "حفظ الأسعار" }).click();
  await page.getByText(/اتحفظت/).waitFor();
  check("blank fee = not available again", (await sb.from("shipping_rates").select("fee").in("governorate", ["القاهرة", "الجيزة"])).data.every((r) => r.fee === null));

  // ---------------------------------------------------------------- products
  await page.goto(base + "/admin/products", { waitUntil: "load" });
  check("products list shows the 3 seeded products", (await page.locator("tbody tr").count()) >= 3);
  await page.getByRole("link", { name: "مريلة مطبخ Chef" }).first().click();
  await page.waitForSelector("#base_price");
  const origPrice = await page.inputValue("#base_price");
  await vis("#base_price").fill("111");
  await vis("#personalization_fee").fill("٣٣");
  await save();
  await page.locator("text=/اتحفظ/ >> visible=true").first().waitFor();
  const prod = (await sb.from("products").select("base_price, personalization_fee").eq("slug", "chef-apron").single()).data;
  check("product price + print fee saved (Arabic digits accepted)", Number(prod.base_price) === 111 && Number(prod.personalization_fee) === 33, JSON.stringify(prod));
  const pg = await html("/products/chef-apron");
  check("storefront product page shows the new price IMMEDIATELY", pg.includes("111 ج.م"), "stale price");
  const home = await html("/");
  check("storefront home card shows the new price IMMEDIATELY", home.includes("111 ج.م"));
  await vis("#base_price").fill("-5");
  await save();
  await vis(".adm-err").first().waitFor();
  check("negative price rejected", Number((await sb.from("products").select("base_price").eq("slug", "chef-apron").single()).data.base_price) === 111);
  await vis("#base_price").fill(origPrice);
  await vis("#personalization_fee").fill("25");
  await save();
  await page.locator("text=/اتحفظ/ >> visible=true").first().waitFor();
  check("price restored", Number((await sb.from("products").select("base_price").eq("slug", "chef-apron").single()).data.base_price) === Number(origPrice));

  // new product with a real image upload
  await page.goto(base + "/admin/products/new", { waitUntil: "load" });
  const productName = `E2E ${tag}`;
  const productSlug = `e2e-${tag}`;
  await vis("#name_ar").fill(productName);
  check("product slug is generated from the name", await vis("#slug").inputValue() === productSlug);
  await vis("#category_id").selectOption({ index: 1 });
  await vis("#base_price").fill("50");
  await vis("#personalization_fee").fill("10");
  await vis('input[type="file"]').setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: PNG });
  await page.waitForSelector(".adm-img img");
  const imgSrc = await page.locator(".adm-img img").first().getAttribute("src");
  check("image uploaded to the PUBLIC product-images bucket", imgSrc.includes("/storage/v1/object/public/product-images/products/"), imgSrc);
  cleanup.objects.push(["product-images", imgSrc.split("/product-images/")[1]]);
  check("uploaded product image is publicly readable", (await fetch(imgSrc)).ok);
  await save();
  await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}\?created=1/);
  const created = (await sb.from("products").select("id, images, is_active").eq("slug", productSlug).single()).data;
  cleanup.products.push(created.id);
  check("new product created with its image", created.images?.[0]?.src === imgSrc && created.is_active === true);
  const np = await html(`/products/${productSlug}`);
  check("new product is live on the storefront immediately (no rebuild)", np.includes(productName) && np.includes("50 ج.م"));
  await vis("#name_ar").fill(`Renamed ${productName}`);
  await vis('input[name="is_active"]').uncheck();
  await save();
  await page.locator("text=/اتحفظ/ >> visible=true").first().waitFor();
  const edited = (await sb.from("products").select("slug").eq("id", created.id).single()).data;
  check("editing a product name keeps its existing URL", edited?.slug === productSlug);
  const hidden = await html(`/products/${productSlug}`);
  check("hiding a product removes it from the storefront immediately", !hidden.includes("50 ج.م") || hidden.includes("data-testid=\"not-found\""));
  // slug collision
  await page.goto(base + "/admin/products/new", { waitUntil: "load" });
  await vis("#name_ar").fill(productName);
  await vis("#category_id").selectOption({ index: 1 });
  await vis("#base_price").fill("50");
  await vis('input[name="is_active"]').uncheck();
  await save();
  await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}\?created=1/);
  const duplicate = (await sb.from("products").select("id").eq("slug", `${productSlug}-2`).single()).data;
  if (duplicate) cleanup.products.push(duplicate.id);
  check("duplicate product name gets its own slug", !!duplicate);

  // ---------------------------------------------------------------- categories
  await page.goto(base + "/admin/categories/new", { waitUntil: "load" });
  await vis("#name_ar").fill(`Cat ${tag}`);
  check("category slug is generated from the name", await vis("#slug").inputValue() === `cat-${tag}`);
  await vis("#description_ar").fill("وصف قسم الاختبار");
  await vis('input[type="file"]').setInputFiles({ name: "cat.png", mimeType: "image/png", buffer: PNG });
  await page.waitForSelector(".adm-img img");
  cleanup.objects.push(["product-images", (await page.locator(".adm-img img").first().getAttribute("src")).split("/product-images/")[1]]);
  await save();
  await page.waitForURL(/\/admin\/categories\/[0-9a-f-]{36}\?created=1/);
  const cat = (await sb.from("categories").select("id").eq("slug", `cat-${tag}`).single()).data;
  cleanup.categories.push(cat.id);
  const h1 = await html("/");
  check("new category appears in nav, footer and home tiles IMMEDIATELY", (h1.match(new RegExp(`/collections/cat-${tag}`, "g")) ?? []).length >= 3, String((h1.match(new RegExp(`/collections/cat-${tag}`, "g")) ?? []).length));
  const cp = await html(`/collections/cat-${tag}`);
  check("new collection page renders with its description", cp.includes(`Cat ${tag}`) && cp.includes("وصف قسم الاختبار"));
  check("category slug is read-only after creation", await vis("#slug").evaluate((e) => e.readOnly));
  await vis("#name_ar").fill(`قسم معدّل ${tag}`);
  await save();
  await page.locator("text=/اتحفظ/ >> visible=true").first().waitFor();
  check("renaming a category updates the storefront immediately", (await html("/")).includes(`قسم معدّل ${tag}`));
  await vis('input[name="is_active"]').uncheck();
  await save();
  await page.locator("text=/اتحفظ/ >> visible=true").first().waitFor();
  check("hiding a category removes it from nav immediately", !(await html("/")).includes(`/collections/cat-${tag}`));

  // ---------------------------------------------------------------- subscribers + logout
  await sb.from("newsletter_subscribers").delete().eq("email", `e2e-${tag}@example.com`);
  await sb.from("newsletter_subscribers").insert({ email: `e2e-${tag}@example.com` });
  await page.goto(base + "/admin/subscribers", { waitUntil: "load" });
  check("subscribers page lists emails", (await page.getByText(`e2e-${tag}@example.com`).count()) >= 1);
  const csv = await page.evaluate(async () => { const r = await fetch("/admin/subscribers/export"); const buf = new Uint8Array(await r.arrayBuffer()); return { s: r.status, bom: buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, t: new TextDecoder().decode(buf), d: r.headers.get("content-disposition") }; });
  check("CSV export works for the admin (BOM, header, attachment)", csv.s === 200 && csv.bom && csv.t.startsWith("email,subscribed_at") && csv.t.includes(`e2e-${tag}@example.com`) && /attachment/.test(csv.d ?? ""), JSON.stringify({ s: csv.s, d: csv.d, head: JSON.stringify(csv.t.slice(0, 60)) }));
  await sb.from("newsletter_subscribers").delete().eq("email", `e2e-${tag}@example.com`);

  await vis('button:has-text("تسجيل الخروج")').click();
  await page.waitForURL(/\/admin\/login/);
  await page.goto(base + "/admin/orders", { waitUntil: "load" });
  check("after logout the admin area is closed again", page.url().includes("/admin/login"));
  await page.goto(base + "/", { waitUntil: "load" });
  await page.locator('a[aria-label="حسابي"] >> visible=true').first().click();
  await page.waitForURL((u) => u.pathname === "/admin/login", { timeout: 20000 });
  check("signed-out visitor clicking the account icon lands on the login form", !!(await page.locator('input[name="password"]').count()));
} finally {
  await browser.close();
  // ---------------------------------------------------------------- cleanup
  for (const id of cleanup.orders) await sb.from("orders").delete().eq("id", id);
  for (const id of cleanup.products) await sb.from("products").delete().eq("id", id);
  for (const id of cleanup.categories) await sb.from("categories").delete().eq("id", id);
  for (const [bucket, p] of cleanup.objects) await sb.storage.from(bucket).remove([p]);
  for (const id of cleanup.users) await sb.auth.admin.deleteUser(id);
  await sb.from("shipping_rates").update({ fee: null }).in("governorate", ["القاهرة", "الجيزة"]);
  await sb.from("products").update({ base_price: apronRow.base_price, personalization_fee: apronRow.personalization_fee }).eq("slug", "chef-apron");
  console.log("INFO  cleaned up: test orders, product, category, uploads, temporary users; fees reset");
}
check("no page errors", errors.length === 0, errors.join(" | "));
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll admin end-to-end checks passed");
process.exit(failed ? 1 : 0);
