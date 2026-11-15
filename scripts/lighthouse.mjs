// Lighthouse (mobile, default throttling) on the key pages of a running PRODUCTION server.
//   node scripts/lighthouse.mjs [base] [outFile] [only-substring]
// Cart and checkout run with two items in localStorage (same browser profile as Lighthouse, storage reset disabled).
import lighthouse from "lighthouse";
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const base = process.argv[2] ?? "http://localhost:3111";
const outFile = process.argv[3] ?? "lighthouse-results.json";
const only = process.argv[4];
const PORT = 9333;

const CART = JSON.stringify({
  state: {
    lines: [
      { key: "chef-apron|name|Fatma|ruqaa|", productId: "chef-apron", mode: "name", text: "Fatma", font: "ruqaa", designPath: null, designName: null, qty: 1 },
      { key: "printed-kitchen-towel|standard|||", productId: "printed-kitchen-towel", mode: "standard", text: null, font: null, designPath: null, designName: null, qty: 2 },
    ],
  },
  version: 1,
});

const pages = [
  { name: "home", path: "/" },
  { name: "collection", path: "/collections/aprons" },
  { name: "product", path: "/products/chef-apron" },
  { name: "cart", path: "/cart", cart: true },
  { name: "checkout", path: "/checkout", cart: true },
].filter((p) => !only || p.name.includes(only));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lh-"));
const ctx = await chromium.launchPersistentContext(profile, { headless: true, args: [`--remote-debugging-port=${PORT}`] });
const results = {};
try {
  for (const p of pages) {
    const page = await ctx.newPage();
    await page.goto(base + "/robots.txt");
    await page.evaluate((c) => (c ? localStorage.setItem("fatma-cart", c) : localStorage.removeItem("fatma-cart")), p.cart ? CART : null);
    await page.close();

    const r = await lighthouse(
      base + p.path,
      { port: PORT, output: "json", logLevel: "error", disableStorageReset: true, onlyCategories: ["performance", "accessibility", "best-practices", "seo"] },
      undefined,
    );
    const lhr = r.lhr;
    if (process.env.LH_FULL) { fs.mkdirSync(process.env.LH_FULL, { recursive: true }); fs.writeFileSync(path.join(process.env.LH_FULL, p.name + ".json"), JSON.stringify(lhr)); }
    const scores = Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round((v.score ?? 0) * 100)]));
    const failing = [];
    for (const cat of Object.values(lhr.categories)) {
      for (const ref of cat.auditRefs) {
        const a = lhr.audits[ref.id];
        if (ref.weight > 0 && a.score !== null && a.score < 0.9) failing.push({ cat: cat.id, id: a.id, title: a.title, score: a.score, display: a.displayValue ?? "" });
      }
    }
    const m = lhr.audits;
    results[p.name] = {
      scores,
      metrics: {
        FCP: m["first-contentful-paint"].displayValue,
        LCP: m["largest-contentful-paint"].displayValue,
        TBT: m["total-blocking-time"].displayValue,
        CLS: m["cumulative-layout-shift"].displayValue,
        SI: m["speed-index"].displayValue,
      },
      failing,
    };
    console.log(p.name.padEnd(11), JSON.stringify(scores), JSON.stringify(results[p.name].metrics));
    for (const f of failing) console.log("   -", f.cat, f.id, f.display ? `(${f.display})` : "");
  }
} finally {
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
