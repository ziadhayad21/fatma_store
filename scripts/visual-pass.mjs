// Final visual pass: every storefront + admin page at 1440 and 390, against a running production server.
//   node --env-file=.env.local scripts/visual-pass.mjs <outDir> [base]
// Creates a temporary admin, a temporary order and a temporary Cairo shipping fee, and removes them afterwards.
// Besides screenshots it asserts: no horizontal overflow, no page errors, no failed same-origin requests,
// no broken images, every <img> has alt, exactly one visible <h1>.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const out = path.resolve(process.argv[2] ?? "shots-final");
const base = process.argv[3] ?? "http://localhost:3111";
fs.mkdirSync(out, { recursive: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ""), process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tag = crypto.randomUUID().slice(0, 6);
const email = `visual-${tag}@example.com`;
const password = `Pw-${crypto.randomUUID()}`;
const cleanup = { users: [], orders: [] };
const u = await sb.auth.admin.createUser({ email, password, email_confirm: true });
if (u.error) throw u.error;
cleanup.users.push(u.data.user.id);
await sb.rpc("grant_admin", { p_email: email });

const apron = (await sb.from("products").select("id").eq("slug", "chef-apron").single()).data.id;
const towelsCat = (await sb.from("categories").select("id").eq("slug", "towels").single()).data.id;
const ord = await sb.rpc("create_order", {
  p_order: {
    customer_name: `VISUAL ${tag} فاطمة`, phone: "01011112222", governorate: "القاهرة", area: "مدينة نصر",
    address: "12 شارع الاختبار، الدور الثالث", notes: "اتصلوا قبل التوصيل", payment_method: "cod", subtotal: 125, shipping: 50, total: 175,
  },
  p_items: [{ product_id: apron, name_snapshot: "مريلة مطبخ Chef", mode: "name", text: "فاطمة", font: "ruqaa", unit_price: 125, qty: 1 }],
});
if (ord.error) throw ord.error;
cleanup.orders.push(ord.data.id);

const CART = JSON.stringify({
  state: {
    lines: [
      { key: "chef-apron|name|Fatma|ruqaa|", productId: "chef-apron", mode: "name", text: "Fatma", font: "ruqaa", designPath: null, designName: null, qty: 1 },
      { key: "printed-kitchen-towel|standard|||", productId: "printed-kitchen-towel", mode: "standard", text: null, font: null, designPath: null, designName: null, qty: 2 },
    ],
  },
  version: 1,
});

const store = [
  { name: "home", path: "/" },
  { name: "towels", path: "/collections/towels" },
  { name: "aprons", path: "/collections/aprons" },
  { name: "bags", path: "/collections/bags" },
  { name: "product-apron", path: "/products/chef-apron" },
  { name: "product-towel", path: "/products/printed-kitchen-towel" },
  { name: "product-bag", path: "/products/polka-dot-bag" },
  { name: "cart-full", path: "/cart", cart: true },
  { name: "cart-empty", path: "/cart" },
  { name: "checkout", path: "/checkout", cart: true, fill: true },
  { name: "checkout-empty", path: "/checkout" },
  { name: "order-confirmation", path: `/order/${ord.data.id}` },
  { name: "order-unknown", path: "/order/00000000-0000-4000-8000-000000000000", quiet: true },
  { name: "not-found", path: "/no-such-page", status: 404, quiet: true },
];
const admin = [
  { name: "admin-dashboard", path: "/admin" },
  { name: "admin-orders", path: "/admin/orders" },
  { name: "admin-order-detail", path: `/admin/orders/${ord.data.id}` },
  { name: "admin-products", path: "/admin/products" },
  { name: "admin-product-edit", path: `/admin/products/${apron}` },
  { name: "admin-product-new", path: "/admin/products/new" },
  { name: "admin-categories", path: "/admin/categories" },
  { name: "admin-category-edit", path: `/admin/categories/${towelsCat}` },
  { name: "admin-shipping", path: "/admin/shipping" },
];

let failed = 0;
const report = (ok, msg) => {
  if (!ok) failed++;
  console.log(ok ? "PASS" : "FAIL", msg);
};
const browser = await chromium.launch();

async function audit(page, label) {
  const issues = [];
  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const wide = [...document.querySelectorAll("body *")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.width > 0 &&
          (r.right > innerWidth + 1 || r.left < -1) &&
          getComputedStyle(e).position !== "fixed" &&
          !e.closest("[aria-hidden=true],[hidden],[inert],.drawer,.mobile-menu")
        );
      })
      .slice(0, 4)
      .map((e) => e.tagName + "." + String(e.className).slice(0, 40));
    return {
      overflow: de.scrollWidth - innerWidth,
      wide,
      noAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).length,
      h1: [...document.querySelectorAll("h1")].filter((h) => h.offsetParent !== null).length,
      broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.offsetParent !== null).map((i) => i.currentSrc.slice(-40)),
    };
  });
  if (m.overflow > 1) issues.push(`horizontal overflow ${m.overflow}px (${m.wide.join(", ")})`);
  if (m.noAlt) issues.push(`${m.noAlt} img without alt`);
  if (m.h1 !== 1) issues.push(`h1 count ${m.h1}`);
  if (m.broken.length) issues.push(`broken images ${m.broken.join(",")}`);
  report(issues.length === 0, `${label} ${issues.join("; ")}`);
}

function watch(page, errors, quiet) {
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("response", (r) => {
    if (!quiet && r.url().startsWith(base) && r.status() >= 400) errors.push(`${r.status()} ${r.url().replace(base, "")}`);
  });
}

try {
  // set the Cairo fee through the real admin form so the storefront cache is invalidated like in production
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base + "/admin/login", { waitUntil: "load" });
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${base}/admin`, { timeout: 20000 });
    await page.goto(base + "/admin/shipping", { waitUntil: "load" });
    await page.fill('input[name="fee:القاهرة"]', "50");
    await page.click('button:text-is("حفظ الأسعار")');
    await page.waitForTimeout(2500);
    await ctx.close();
  }
  for (const width of [1440, 390]) {
    const viewport = { width, height: width > 600 ? 900 : 844 };
    // storefront: a fresh context per page so the cart state is explicit
    for (const it of store) {
      const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
      if (it.cart) await ctx.addInitScript((v) => localStorage.setItem("fatma-cart", v), CART);
      const page = await ctx.newPage();
      const errors = [];
      watch(page, errors, it.quiet);
      const resp = await page.goto(base + it.path, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(700);
      if (it.fill) {
        await page.fill('input[name="name"]', "فاطمة أحمد").catch(() => {});
        await page.fill('input[name="phone"]', "01012345678").catch(() => {});
        await page.selectOption('select[name="governorate"]', "القاهرة").catch(() => {});
        await page.fill('input[name="area"]', "مدينة نصر").catch(() => {});
        await page.fill('textarea[name="address"]', "12 شارع الاختبار").catch(() => {});
        await page.waitForTimeout(300);
      }
      const label = `${width} ${it.name}`;
      if (it.status) report(resp.status() === it.status, `${label} http ${resp.status()}`);
      await audit(page, label);
      report(errors.length === 0, `${label} errors: ${errors.join(" | ")}`);
      await page.screenshot({ path: path.join(out, `${it.name}-${width}.png`), fullPage: true });
      await ctx.close();
    }

    // admin: login page anonymous, then everything else signed in through the real form
    const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errors = [];
    watch(page, errors, false);
    await page.goto(base + "/admin/login", { waitUntil: "load" });
    await page.waitForSelector("h1", { timeout: 10000 }).catch(() => {});
    await audit(page, `${width} admin-login`);
    await page.screenshot({ path: path.join(out, `admin-login-${width}.png`), fullPage: true });
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${base}/admin`, { timeout: 20000 });
    for (const it of admin) {
      await page.goto(base + it.path, { waitUntil: "load" });
      await page.waitForTimeout(500);
      await audit(page, `${width} ${it.name}`);
      await page.screenshot({ path: path.join(out, `${it.name}-${width}.png`), fullPage: true });
    }
    report(errors.length === 0, `${width} admin errors: ${errors.join(" | ")}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await sb.from("shipping_rates").update({ fee: null }).eq("governorate", "القاهرة");
  for (const id of cleanup.orders) await sb.from("orders").delete().eq("id", id);
  for (const id of cleanup.users) await sb.auth.admin.deleteUser(id);
}
console.log(failed ? `\n${failed} problem(s)` : "\nall clean");
process.exit(failed ? 1 : 0);
