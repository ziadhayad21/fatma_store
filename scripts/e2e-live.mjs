// REAL end-to-end test against your Supabase project + a running server:
//   personalized items (name + uploaded design) -> cash-on-delivery order -> verify DB + storage -> clean up.
// usage: node --env-file=.env.local scripts/e2e-live.mjs [base]
// Requires shipping fee set for القاهرة (the script sets/reverts a TEMPORARY 40 only if it is NULL).
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import zlib from "node:zlib";

const base = process.argv[2] ?? "http://localhost:3111";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const sb = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

let failed = 0;
const check = (name, pass, extra = "") => {
  if (!pass) failed++;
  console.log(pass ? "PASS" : "FAIL", name, pass ? "" : extra);
};

// a real 400x400 PNG (~ a few KB) so the thumbnail check is meaningful
function makePng(w, h) {
  const crc = (buf) => {
    let c, crcTable = [];
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
    let x = 0xffffffff;
    for (const b of buf) x = crcTable[(x ^ b) & 0xff] ^ (x >>> 8);
    return (x ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 3 + 1) + 1 + x * 3;
    raw[o] = (x * 255) / w; raw[o + 1] = (y * 255) / h; raw[o + 2] = 150;
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const { data: rate } = await sb.from("shipping_rates").select("fee").eq("governorate", "القاهرة").single();
const shippingFee = Number(rate.fee);
check("shipping fee for القاهرة is set (needed for checkout)", rate.fee !== null);
const prices = Object.fromEntries((await sb.from("products").select("slug, base_price")).data.map((p) => [p.slug, p]));
const apron = prices["chef-apron"], bag = prices["polka-dot-bag"];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const vis = (s) => page.locator(`${s} >> visible=true`);
const png = makePng(400, 400);
console.log(`INFO  test image ${png.length} bytes`);

let orderId = null;
let designPath = null;
try {
  // ---- 1. design item (real upload with progress)
  await page.goto(base + "/products/polka-dot-bag", { waitUntil: "load" });
  await vis(".opt").nth(2).click();
  const progress = [];
  await page.exposeFunction("__p", (t) => progress.push(t));
  await page.evaluate(() => {
    new MutationObserver(() => {
      const el = document.querySelector(".file-row [role=status]");
      if (el) window.__p(el.textContent);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.locator('input[type="file"]').setInputFiles({ name: "my-logo.png", mimeType: "image/png", buffer: png });
  await page.waitForFunction(() => document.querySelector(".file-row")?.textContent?.includes("اترفع بنجاح"), null, { timeout: 30000 });
  check("upload finished: 'اترفع بنجاح'", true);
  check("upload showed progress text", progress.some((t) => t.includes("بيترفع")), progress.join(" | "));
  const thumbOk = await page.evaluate(() => { const i = document.querySelector(".file-row img"); return !!i && i.complete && i.naturalWidth > 0; });
  check("local thumbnail renders", thumbOk);
  await vis(".info .btn-d").click();
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");

  // ---- 2. name item
  await page.goto(base + "/products/chef-apron", { waitUntil: "load" });
  await vis(".opt").nth(1).click();
  await vis("#nm").fill("Fatma");
  await vis(".fo").nth(1).click();
  await vis(".info .btn-d").click();
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");

  // ---- 3. thumbnails persist after reload via signed URL
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("fatma-cart")).state.lines);
  designPath = stored.find((l) => l.mode === "design")?.designPath;
  check("cart line stores a storage path (not a file/URL)", /^uploads\/\d{4}-\d{2}\/[0-9a-f-]{36}\.png$/.test(designPath ?? ""), String(designPath));
  await page.goto(base + "/cart", { waitUntil: "load" });
  await page.waitForFunction(() => [...document.querySelectorAll(".row img.thumb-d")].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 20000 }).catch(() => {});
  const cartThumb = await page.evaluate(() => { const i = document.querySelector(".row img.thumb-d"); return i ? { src: i.src.slice(0, 80), ok: i.complete && i.naturalWidth > 0 } : null; });
  check("cart thumbnail loads from a signed URL after reload", !!cartThumb?.ok && cartThumb.src.includes("/object/sign/designs/"), JSON.stringify(cartThumb));

  // ---- 4. checkout (COD)
  await page.goto(base + "/checkout", { waitUntil: "load" });
  await page.waitForSelector('select[name="governorate"]');
  await page.fill('input[name="name"]', "E2E Test Customer");
  await page.fill('input[name="phone"]', "٠١٠١٢٣٤٥٦٧٨"); // Arabic digits on purpose
  await page.selectOption('select[name="governorate"]', "القاهرة");
  await page.fill('input[name="area"]', "مدينة نصر");
  await page.fill('input[name="address"]', "12 شارع الاختبار، الدور 3");
  await page.fill('textarea[name="notes"]', "طلب تجريبي — E2E");
  // one price whatever the option: no printing cost
  const expectedSubtotal = Number(apron.base_price) + Number(bag.base_price);
  const sumText = (await page.locator(".sum").textContent()) ?? "";
  check("checkout summary shows the shipping fee for القاهرة", sumText.includes(String(shippingFee)));
  await page.getByRole("button", { name: /تأكيد الطلب/ }).click();
  await page.waitForURL(/\/order\/[0-9a-f-]{36}/, { timeout: 30000 });
  orderId = page.url().split("/order/")[1];
  check("redirected to /order/<uuid>", true, page.url());
  await page.getByText("وصلنا طلبك").waitFor({ timeout: 20000 });
  const orderHtml = (await page.locator("body").textContent()) ?? "";
  check("confirmation shows order number + total", /#10\d\d/.test(orderHtml) && orderHtml.includes(String(expectedSubtotal + shippingFee)));
  check("confirmation shows COD + customer data", orderHtml.includes("الدفع عند الاستلام") && orderHtml.includes("E2E Test Customer") && orderHtml.includes("01012345678"));
  await page.waitForFunction(() => [...document.querySelectorAll(".order-row img")].some((i) => i.src.includes("/object/sign/designs/") && i.complete && i.naturalWidth > 0), null, { timeout: 20000 }).catch(() => {});
  check("confirmation shows the uploaded design (signed URL)", await page.evaluate(() => [...document.querySelectorAll(".order-row img")].some((i) => i.src.includes("/object/sign/designs/") && i.complete && i.naturalWidth > 0)));
  const cartAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("fatma-cart"))?.state?.lines?.length ?? 0);
  check("cart was cleared", cartAfter === 0);
  const robots = await page.locator('meta[name="robots"]').getAttribute("content");
  check("order page is noindex", /noindex/.test(robots ?? ""), String(robots));

  // ---- 5. verify what is really stored
  const { data: order, error } = await sb.from("orders").select("*, order_items(*)").eq("id", orderId).single();
  check("order row exists", !error && !!order, error?.message);
  if (order) {
    check("order: status new, payment cod, phone normalized", order.status === "new" && order.payment_method === "cod" && order.phone === "01012345678");
    check("order: customer + address + notes saved", order.customer_name === "E2E Test Customer" && order.governorate === "القاهرة" && order.area === "مدينة نصر" && order.address.includes("الاختبار") && order.notes.includes("E2E"));
    check("order: totals computed on the server", Number(order.subtotal) === expectedSubtotal && Number(order.shipping) === shippingFee && Number(order.total) === expectedSubtotal + shippingFee, JSON.stringify({ s: order.subtotal, sh: order.shipping, t: order.total, expectedSubtotal }));
    check("order: number assigned (>=1001)", Number(order.number) >= 1001, String(order.number));
    const items = order.order_items;
    const d = items.find((i) => i.mode === "design"), n = items.find((i) => i.mode === "name");
    check("2 items saved", items.length === 2);
    check("design item: path + snapshot + unit price", !!d && d.design_path === designPath && d.name_snapshot.includes("Polka") && Number(d.unit_price) === Number(bag.base_price) && d.qty === 1 && d.text === null && d.font === null, JSON.stringify(d));
    check("name item: text + font + unit price", !!n && n.text === "Fatma" && n.font === "kufi" && Number(n.unit_price) === Number(apron.base_price) && n.design_path === null, JSON.stringify(n));
  }
  const dir = designPath.slice(0, designPath.lastIndexOf("/")), name = designPath.slice(designPath.lastIndexOf("/") + 1);
  const listed = await sb.storage.from("designs").list(dir, { search: name });
  const obj = listed.data?.find((o) => o.name === name);
  check("design file is stored in the private bucket (right size/type)", !!obj && obj.metadata?.size === png.length && obj.metadata?.mimetype === "image/png", JSON.stringify(obj?.metadata));
  check("design file is NOT publicly reachable", !(await fetch(`${url}/storage/v1/object/public/designs/${designPath}`)).ok);
  const signed = await sb.storage.from("designs").createSignedUrl(designPath, 60);
  const dl = await fetch(signed.data.signedUrl);
  check("admin-style signed URL downloads the exact file", dl.ok && Buffer.from(await dl.arrayBuffer()).equals(png));

} finally {
  // ---- cleanup
  if (orderId) await sb.from("orders").delete().eq("id", orderId);
  if (designPath) await sb.storage.from("designs").remove([designPath]);
  await browser.close();
  console.log("INFO  cleaned up the test order and upload");
}
check("no page errors", errors.length === 0, errors.join(" | "));
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll end-to-end checks passed");
process.exit(failed ? 1 : 0);
