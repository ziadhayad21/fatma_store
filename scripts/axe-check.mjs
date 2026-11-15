// Automated accessibility check (axe-core) on every storefront page, incl. open drawer / menu states,
// at 1440 and 390. Uses reduced motion so half-faded reveal animations don't cause false contrast results.
//   node scripts/axe-check.mjs [base]
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const base = process.argv[2] ?? "http://localhost:3111";
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
  ["home", "/"],
  ["collection", "/collections/aprons"],
  ["product", "/products/chef-apron"],
  ["product-name-mode", "/products/chef-apron", async (p) => { await p.locator(".opt >> visible=true").nth(1).click(); }],
  ["product-design-mode", "/products/polka-dot-bag", async (p) => { await p.locator(".opt >> visible=true").nth(2).click(); }],
  ["cart", "/cart", null, true],
  ["checkout", "/checkout", null, true],
  ["cart-drawer", "/", async (p) => { await p.locator('button[aria-label*="السلة"] >> visible=true').first().click(); await p.waitForTimeout(600); }, true],
  ["mobile-menu", "/", async (p) => { const b = p.locator('button[aria-label*="القائمة"] >> visible=true').first(); if (await b.count()) { await b.click(); await p.waitForTimeout(600); } }],
  ["not-found", "/nope"],
  ["admin-login", "/admin/login"],
];

let bad = 0;
const browser = await chromium.launch();
for (const width of [1440, 390]) {
  for (const [name, path, act, cart] of pages) {
    if (name === "mobile-menu" && width > 600) continue;
    const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 }, reducedMotion: "reduce" });
    if (cart) await ctx.addInitScript((v) => localStorage.setItem("fatma-cart", v), CART);
    const page = await ctx.newPage();
    await page.goto(base + path, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    if (act) await act(page);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
    const label = `${width} ${name}`;
    if (r.violations.length === 0) console.log("PASS", label);
    for (const v of r.violations) {
      bad++;
      console.log("FAIL", label, `[${v.impact}] ${v.id}: ${v.help}`);
      for (const n of v.nodes.slice(0, 3)) console.log("     ", n.target.join(" "), "|", (n.failureSummary ?? "").split("\n").slice(1, 3).join(" ").slice(0, 160));
    }
    await ctx.close();
  }
}
await browser.close();
console.log(bad ? `\n${bad} violation(s)` : "\nno violations");
process.exit(bad ? 1 : 0);
