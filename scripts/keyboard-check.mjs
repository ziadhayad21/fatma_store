// Keyboard-only pass on a running production server (no mouse clicks anywhere).
//   node scripts/keyboard-check.mjs [base]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3111";
let failed = 0;
const check = (n, ok, x = "") => {
  if (!ok) failed++;
  console.log(ok ? "PASS" : "FAIL", n, ok ? "" : x);
};
const CART = JSON.stringify({
  state: { lines: [{ key: "chef-apron|standard|||", productId: "chef-apron", mode: "standard", text: null, font: null, designPath: null, designName: null, qty: 1 }] },
  version: 1,
});

/** What the focused element looks like: a visible indicator is an outline or a box-shadow ring, or a changed border. */
const focusInfo = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    // custom controls wrapping a hidden native input show their ring on the wrapper
    const host = el.closest("label, .drop") ?? el;
    const vis = (e) => {
      const cs = getComputedStyle(e);
      const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
      const shadow = cs.boxShadow && cs.boxShadow !== "none";
      return outline || shadow;
    };
    // text fields show focus as a clearly different border colour (design kit) instead of an outline
    const borderRing = (e) => {
      const on = getComputedStyle(e).borderColor;
      e.blur();
      const off = getComputedStyle(e).borderColor;
      e.focus({ focusVisible: true });
      return on !== off;
    };
    const r = el.getBoundingClientRect();
    const hostVisible = vis(el) || vis(host) || (["INPUT","TEXTAREA","SELECT"].includes(el.tagName) && el.type !== "file" && borderRing(el)) || !!el.closest(":focus-within") && vis(el.closest(".drop, .panel, label") ?? el);
    const style = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      label: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.id || "").trim().slice(0, 40),
      visible: hostVisible,
      onScreen: r.width > 0 && r.height > 0 || el.classList.contains("vh"),
      hidden: style.visibility === "hidden" || el.closest("[inert]") !== null,
      tabindex: el.getAttribute("tabindex"),
    };
  });

async function tabThrough(page, name, max = 80) {
  const bad = [];
  const seen = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const f = await focusInfo(page);
    if (!f) break;
    seen.push(f.label || f.tag);
    if (f.hidden) bad.push(`focus landed on hidden/inert element: ${f.tag} "${f.label}"`);
    if (f.tabindex && Number(f.tabindex) > 0) bad.push(`positive tabindex on ${f.tag} "${f.label}"`);
    if (!f.visible) bad.push(`no visible focus indicator: ${f.tag} "${f.label}"`);
    if (seen.length > 3 && seen[seen.length - 1] === seen[0] && seen.length > 8) break; // wrapped around
  }
  check(`${name}: ${seen.length} tab stops, all visible & reachable`, bad.length === 0, bad.slice(0, 6).join(" ; "));
  return seen;
}

const browser = await chromium.launch();
const mk = async (width, cart) => {
  const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 }, reducedMotion: "reduce" });
  if (cart) await ctx.addInitScript((v) => localStorage.setItem("fatma-cart", v), CART);
  const page = await ctx.newPage();
  return { ctx, page };
};

// ---------------------------------------------------------------- skip link + order of tab stops (desktop)
{
  const { ctx, page } = await mk(1440);
  await page.goto(base + "/", { waitUntil: "load" });
  await page.waitForTimeout(500);
  await page.keyboard.press("Tab");
  const first = await focusInfo(page);
  check("home: first Tab stop is the skip link", /تخط|skip/i.test(first?.label ?? ""), JSON.stringify(first));
  check("home: skip link is visible when focused", !!first?.visible);
  await page.keyboard.press("Enter");
  const target = await page.evaluate(() => location.hash);
  check("home: skip link jumps to #main", target === "#main", target);
  await page.goto(base + "/", { waitUntil: "load" });
  await page.waitForTimeout(500);
  const seen = await tabThrough(page, "home", 70);
  // RTL: first stops after the skip link must be the right-hand side of the header (menu/logo before cart)
  console.log("     first stops:", seen.slice(0, 9).join(" > "));
  await ctx.close();
}

for (const [name, path, cart] of [["collection", "/collections/aprons"], ["product", "/products/chef-apron"], ["cart", "/cart", true], ["checkout", "/checkout", true]]) {
  const { ctx, page } = await mk(1440, cart);
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(900);
  await tabThrough(page, name, 70);
  await ctx.close();
}

// ---------------------------------------------------------------- cart drawer: open, trap, Escape, focus return
for (const width of [1440, 390]) {
  const { ctx, page } = await mk(width, true);
  await page.goto(base + "/", { waitUntil: "load" });
  await page.waitForTimeout(800);
  const opener = page.locator('button[aria-label^="فتح السلة"] >> visible=true').first();
  await opener.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  check(`${width} cart drawer: Enter opens it and focus moves inside`, await inside());
  let stayed = true;
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    if (!(await inside())) stayed = false;
  }
  check(`${width} cart drawer: Tab stays trapped inside`, stayed);
  stayed = true;
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Shift+Tab");
    if (!(await inside())) stayed = false;
  }
  check(`${width} cart drawer: Shift+Tab stays trapped inside`, stayed);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const backOnOpener = await page.evaluate(() => document.activeElement?.getAttribute("aria-label")?.startsWith("فتح السلة"));
  check(`${width} cart drawer: Escape closes it and focus returns to the cart button`, backOnOpener === true);
  const behind = await page.evaluate(() => !!document.querySelector('[role="dialog"]:not([inert])'));
  check(`${width} cart drawer: closed drawer is inert (not tabbable)`, behind === false);
  await ctx.close();
}

// ---------------------------------------------------------------- mobile menu
{
  const { ctx, page } = await mk(390);
  await page.goto(base + "/", { waitUntil: "load" });
  await page.waitForTimeout(800);
  const burger = page.locator('button[aria-label="فتح القائمة"]');
  await burger.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  check("390 mobile menu: opens with Enter, focus inside", await inside());
  let stayed = true;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    if (!(await inside())) stayed = false;
  }
  check("390 mobile menu: Tab trapped", stayed);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  check("390 mobile menu: Escape closes and returns focus to the burger", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "فتح القائمة"));
  await ctx.close();
}

// ---------------------------------------------------------------- product page: option cards, font tiles, upload
{
  const { ctx, page } = await mk(1440);
  await page.goto(base + "/products/chef-apron", { waitUntil: "load" });
  await page.waitForTimeout(900);
  const opts = page.locator(".opt >> visible=true");
  await opts.nth(0).focus();
  await page.keyboard.press("Tab");
  check("option cards: Tab moves to the next card", await opts.nth(1).evaluate((e) => e === document.activeElement));
  await page.keyboard.press("Space");
  check("option cards: Space selects 'name' mode", (await opts.nth(1).getAttribute("aria-pressed")) === "true");
  // name field appears; type with the keyboard, pick a font with the keyboard
  await page.waitForTimeout(300);
  await page.keyboard.press("Tab"); // third option card
  await page.keyboard.press("Tab");
  const focusedIsInput = await page.evaluate(() => document.activeElement?.tagName === "INPUT");
  check("name mode: Tab from the cards lands in the name field", focusedIsInput);
  await page.keyboard.type("Fatma");
  check("name mode: typing works", (await page.evaluate(() => document.activeElement.value)) === "Fatma");
  await page.keyboard.press("Tab");
  const fontTiles = page.locator(".fo >> visible=true");
  check("font tiles: Tab reaches the first font tile", await fontTiles.nth(0).evaluate((e) => e === document.activeElement));
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  check("font tiles: Enter selects the 2nd font", (await fontTiles.nth(1).getAttribute("aria-pressed")) === "true");
  const ring = await focusInfo(page);
  check("font tiles: focus ring visible", !!ring?.visible, JSON.stringify(ring));
  // add to cart by keyboard
  for (let i = 0; i < 12; i++) {
    const t = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (t === "أضف للسلة") break;
    await page.keyboard.press("Tab");
  }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  const cartDrawerOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"]:not([inert])'));
  check("add to cart with Enter opens the cart drawer", cartDrawerOpen);
  await ctx.close();
}
{
  const { ctx, page } = await mk(1440);
  await page.goto(base + "/products/polka-dot-bag", { waitUntil: "load" });
  await page.waitForTimeout(900);
  const opts = page.locator(".opt >> visible=true");
  await opts.nth(1).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space"); // 'design' card
  await page.waitForTimeout(300);
  await page.keyboard.press("Tab");
  const f = await focusInfo(page);
  check("upload: Tab reaches the file input", f?.tag === "input", JSON.stringify(f));
  check("upload: the drop zone shows a focus ring while the hidden input is focused", !!f?.visible, JSON.stringify(f));
  const chooser = page.waitForEvent("filechooser", { timeout: 4000 }).then(() => true, () => false);
  await page.keyboard.press("Space");
  check("upload: Space opens the file chooser", await chooser);
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
