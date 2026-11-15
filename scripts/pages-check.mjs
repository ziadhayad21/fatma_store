// Every product and collection page must load in a real browser with no console errors, no page errors and
// (when a server log is given) no server errors — in `next dev` AND on the production build.
//   node scripts/pages-check.mjs <base> [serverLogFile]
// Regression for: "Invariant: Route "/products/[slug]" did not produce a static shell" (dev), which came from
// a next.config option combined with dynamic generateMetadata.
import { chromium } from "playwright";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:3111";
const logFile = process.argv[3];
let failed = 0;
const check = (n, ok, x = "") => {
  if (!ok) failed++;
  console.log(ok ? "PASS" : "FAIL", n, ok ? "" : x);
};

// slugs come from the sitemap (same cached catalog the site uses)
const xml = await (await fetch(base + "/sitemap.xml")).text();
const paths = [...xml.matchAll(/<loc>[^<]*?(\/(?:products|collections)\/[^<]+)<\/loc>/g)].map((m) => m[1]);
if (!paths.length) throw new Error("no product/collection URLs in sitemap");

const logStart = logFile && fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
const editKey = encodeURIComponent("chef-apron|name|Fatma|ruqaa|");
const variants = [];
for (const p of paths) {
  variants.push(p);
  if (p.startsWith("/products/")) {
    variants.push(`${p}?edit=${editKey}`); // cart "عدّل" prefill
    variants.push(`${p}?edit=not-a-real-line`); // garbage must not crash
  } else {
    variants.push(`${p}?sort=low&page=1`);
  }
}
variants.push("/products/no-such-product", "/collections/no-such-collection");

const browser = await chromium.launch();

// header account link (desktop) and the "تسجيل الدخول" link at the bottom of the mobile menu
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + "/", { waitUntil: "load" });
  const a = page.locator('a[aria-label="حسابي"]');
  check("desktop: account icon is an <a> to /admin/login", (await a.count()) === 1 && (await a.getAttribute("href")) === "/admin/login");
  await ctx.close();
  const m = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await m.newPage();
  await mp.goto(base + "/", { waitUntil: "load" });
  check("mobile: header account icon is hidden", !(await mp.locator('a[aria-label="حسابي"]').isVisible()));
  await mp.locator('button[aria-label="فتح القائمة"]').click();
  await mp.waitForTimeout(700);
  const l = mp.locator('.mmenu a:has-text("تسجيل الدخول")');
  check("mobile: menu has a 'تسجيل الدخول' link to /admin/login", (await l.count()) === 1 && (await l.getAttribute("href")) === "/admin/login");
  const pos = await mp.evaluate(() => {
    const menu = document.querySelector(".mmenu").getBoundingClientRect();
    const link = document.querySelector(".mm-acct").getBoundingClientRect();
    return menu.bottom - link.bottom;
  });
  check("mobile: the link sits at the bottom of the drawer", pos >= 0 && pos < 40, String(pos));
  await l.click();
  await mp.waitForURL((u) => u.pathname === "/admin/login", { timeout: 15000 });
  check("mobile: the link opens the login page", mp.url().includes("/admin/login"));
  await m.close();
}

for (const v of variants) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push("console: " + m.text().slice(0, 140));
  });
  const missing = v.includes("no-such");
  const res = await page.goto(base + v, { waitUntil: "load" });
  await page.waitForTimeout(700);
  const h1 = await page.locator("h1 >> visible=true").count();
  const status = res?.status();
  // unknown slugs render the Arabic 404 page (HTTP 200 + noindex is the accepted behaviour for streamed pages)
  const notFoundShown = (await page.locator("[data-testid=not-found]").count()) > 0;
  check(`${v}  ${missing ? "(unknown slug: 404 page)" : ""}`, (missing ? notFoundShown : status === 200 && !notFoundShown) && h1 >= 1 && problems.length === 0, `status ${status} h1 ${h1} notFound ${notFoundShown} ${problems.join(" | ")}`);
  await ctx.close();
}
await browser.close();

if (logFile) {
  await new Promise((r) => setTimeout(r, 800));
  const text = fs.readFileSync(logFile, "utf8").slice(logStart);
  const bad = text.split("\n").filter((l) => /InvariantError|Invariant:|did not produce a static shell|⨯|\bError:|Unhandled|uncached data/.test(l));
  check(`server log has no errors while loading ${variants.length} URLs`, bad.length === 0, bad.slice(0, 4).join(" || "));
}
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
