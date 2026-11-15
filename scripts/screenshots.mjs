// Screenshots the real site and the rendered design files at 1440 and 390 wide.
// usage: node scripts/screenshots.mjs <outDir> [siteBase] [only-substring]
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const out = path.resolve(process.argv[2] ?? "shots");
const base = process.argv[3] ?? "http://localhost:3111";
const only = process.argv[4];
fs.mkdirSync(out, { recursive: true });
const designDir = path.resolve("fatma-site-kit/fatma-site-kit/design-render");

const pages = [
  { name: "home", site: "/", design: "home.html" },
  { name: "towels", site: "/collections/towels", design: "collection-towels.html" },
  { name: "aprons", site: "/collections/aprons", design: "collection-aprons.html" },
  { name: "bags", site: "/collections/bags", design: "collection-bags.html" },
  { name: "product-apron", site: "/products/chef-apron", design: "product-apron.html" },
  { name: "product-towel", site: "/products/printed-kitchen-towel", design: "product-towel.html" },
  { name: "product-bag", site: "/products/polka-dot-bag", design: "product-bag.html" },
  { name: "cart", site: "/cart", design: "cart.html", cart: true },
];

const cartState = JSON.stringify({
  state: {
    lines: [
      { key: "chef-apron|name|Fatma|ruqaa|", productId: "chef-apron", mode: "name", text: "Fatma", font: "ruqaa", designPath: null, designName: null, qty: 1 },
      { key: "printed-kitchen-towel|standard|||", productId: "printed-kitchen-towel", mode: "standard", text: null, font: null, designPath: null, designName: null, qty: 2 },
    ],
  },
  version: 1,
});

const browser = await chromium.launch();
for (const width of [1440, 390]) {
  for (const pg of pages) {
    if (only && !pg.name.includes(only)) continue;
    for (const kind of ["site", "design"]) {
      const ctx = await browser.newContext({
        viewport: { width, height: width > 600 ? 900 : 844 },
        reducedMotion: "reduce", // final state of every animation
        deviceScaleFactor: 1,
      });
      if (pg.cart) await ctx.addInitScript((s) => localStorage.setItem("fatma-cart", s), cartState);
      const page = await ctx.newPage();
      const url = kind === "site" ? base + pg.site : pathToFileURL(path.join(designDir, pg.design)).href;
      await page.goto(url, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(out, `${pg.name}-${width}-${kind}.png`), fullPage: true });
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      console.log(pg.name, width, kind, "height", h, sw > width ? `OVERFLOW-X ${sw}` : "");
      await ctx.close();
    }
  }
}
await browser.close();
