// Behaviour checks against a running production server. usage: node scripts/behavior-check.mjs [base]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3111";
const results = [];
const ok = (name, pass, extra = "") => {
  results.push(pass);
  console.log(pass ? "PASS" : "FAIL", name, extra);
};

const browser = await chromium.launch();

// ---------- desktop ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(base + "/", { waitUntil: "load" });
  ok("html lang/dir", (await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir].join())) === "ar,rtl");
  ok("body font is Readex Pro", /Readex/i.test(await page.evaluate(() => getComputedStyle(document.body).fontFamily)) || (await page.evaluate(() => document.fonts.check("16px Readex Pro"))));

  // announcement bar rotates
  const o1 = await page.evaluate(() => [...document.querySelectorAll(".ann span")].map((s) => +getComputedStyle(s).opacity));
  await page.waitForTimeout(4200);
  const o2 = await page.evaluate(() => [...document.querySelectorAll(".ann span")].map((s) => +getComputedStyle(s).opacity));
  ok("announcement rotates", JSON.stringify(o1) !== JSON.stringify(o2), `${o1} -> ${o2}`);

  // hero headline slides up (animation names present) and video zoom
  const anim = await page.evaluate(() => ({
    line: getComputedStyle(document.querySelector(".ln > span")).animationName,
    video: getComputedStyle(document.querySelector(".hero video")).animationName,
    muted: document.querySelector(".hero video").muted,
    poster: document.querySelector(".hero video").getAttribute("poster"),
  }));
  ok("hero line + video animations", anim.line === "lineup" && anim.video === "zoom" && anim.muted, JSON.stringify(anim));

  // marquee: runs and pauses on hover
  const mqName = await page.evaluate(() => getComputedStyle(document.querySelector(".mq-t")).animationName);
  await page.locator(".mq").scrollIntoViewIfNeeded();
  await page.locator(".mq").hover();
  const paused = await page.evaluate(() => getComputedStyle(document.querySelector(".mq-t")).animationPlayState);
  ok("marquee runs + pauses on hover", mqName === "mq" && paused === "paused", `${mqName}/${paused}`);
  const mqText = await page.evaluate(() => [...document.querySelectorAll(".mq-i")][0].textContent.trim());
  const sizes = await page.evaluate(() => [...new Set([...document.querySelectorAll(".mq-i > span")].map((s) => getComputedStyle(s).fontSize + "/" + getComputedStyle(s).fontWeight))]);
  ok("marquee words same size+weight", sizes.length === 1 && mqText.includes("بتصميمك"), sizes.join());

  // scroll reveal supported + fade-up
  const rv = await page.evaluate(() => ({ supported: CSS.supports("animation-timeline: view()"), name: getComputedStyle(document.querySelector(".rv")).animationName }));
  console.log("INFO scroll-timeline supported:", rv.supported, rv.name);

  // product card hover: crossfade + quick add slides up
  await page.locator("#shop .card").first().scrollIntoViewIfNeeded();
  const card = page.locator("#shop .card").first();
  const before = await card.locator(".qa").evaluate((e) => getComputedStyle(e).transform);
  await card.hover();
  await page.waitForTimeout(900);
  const after = await card.locator(".qa").evaluate((e) => getComputedStyle(e).transform);
  const mainOp = await card.locator("img.main").evaluate((e) => +getComputedStyle(e).opacity);
  const altOp = await card.locator("img.alt").evaluate((e) => +getComputedStyle(e).opacity);
  ok("card hover: quick-add slides up, crossfades to 2nd image", before !== after && after === "none" && mainOp < 0.1 && altOp > 0.9, `main ${mainOp} alt ${altOp}`);

  // button hover sweep
  const btn = page.locator(".btn-d").first();
  await btn.scrollIntoViewIfNeeded();
  await btn.hover();
  await page.waitForTimeout(800);
  const sweep = await btn.evaluate((e) => getComputedStyle(e, "::before").transform);
  ok("dark button hover fill sweeps in (scaleX 1)", sweep === "matrix(1, 0, 0, 1, 0, 0)" || sweep === "none", sweep);

  // cart drawer: add from quick-add -> slides in from LEFT, badge, focus trap, Esc
  await card.hover();
  await card.locator(".qa").click();
  await page.waitForTimeout(900);
  const dr = await page.locator(".drawer").boundingBox();
  ok("cart drawer opens on the LEFT", dr && dr.x < 5 && dr.width > 300, JSON.stringify(dr));
  const badge = await page.locator(".badge").textContent();
  ok("cart badge shows 1", badge?.trim() === "1", badge ?? "");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const inside = await page.evaluate(() => document.querySelector(".drawer").contains(document.activeElement));
  ok("focus stays trapped inside drawer", inside);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  ok("Esc closes drawer", (await page.locator(".drawer.on").count()) === 0);

  // persistence after reload
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(500);
  ok("cart persisted after reload", (await page.locator(".badge").textContent())?.trim() === "1");

  // wishlist
  await page.locator("#shop .card").first().hover();
  await page.locator("#shop .card .wish").first().click();
  ok("wishlist aria-pressed", (await page.locator("#shop .card .wish").first().getAttribute("aria-pressed")) === "true");

  // collection: chips, sort, promo, count
  await page.goto(base + "/collections/aprons", { waitUntil: "load" });
  ok("collection: 3 chips from DB", (await page.locator(".chip").count()) === 3);
  ok("collection: promo tile shown (<3 products)", (await page.locator(".promo").count()) === 1);
  await page.selectOption("#sort", "low");
  await page.waitForURL(/sort=low/);
  ok("sort select updates URL", page.url().includes("sort=low"));

  // product page: gallery arrows + counter
  await page.goto(base + "/products/chef-apron", { waitUntil: "load" });
  ok("counter 1 / 2", (await page.locator(".counter").textContent()) === "1 / 2");
  await page.locator(".stage").hover();
  await page.locator('button[aria-label="الصورة التالية"]').click();
  ok("next arrow -> 2 / 2", (await page.locator(".counter").textContent()) === "2 / 2");
  ok("name option disables add + helper text", await (async () => {
    await page.locator(".opt").nth(1).click();
    return (await page.locator(".info .btn-d").isDisabled()) && (await page.getByText("اكتب الاسم الأول").count()) === 1;
  })());
  ok("print cost label shows", (await page.getByText("+ تكلفة الطباعة").count()) === 1);

  // cart page
  await page.goto(base + "/cart", { waitUntil: "load" });
  await page.waitForTimeout(600);
  ok("cart page lists the line", (await page.locator(".row").count()) === 1);

  ok("no console/page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  // unknown slugs render the not-found page (status stays 200 because content streams inside Suspense)
  await page.goto(base + "/products/nope", { waitUntil: "load" });
  await page.getByTestId("not-found").waitFor({ timeout: 8000 }).catch(() => {});
  const nf1 = await page.getByTestId("not-found").count();
  await page.goto(base + "/collections/nope", { waitUntil: "load" });
  await page.getByTestId("not-found").waitFor({ timeout: 8000 }).catch(() => {});
  const nf2 = await page.getByTestId("not-found").count();
  ok("unknown product/collection -> not-found page", nf1 === 1 && nf2 === 1);
  await ctx.close();
}

// ---------- mobile ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(base + "/", { waitUntil: "load" });
  ok("mobile: burger visible, nav hidden", (await page.locator(".burger").isVisible()) && !(await page.locator(".nav").isVisible()));
  await page.locator(".burger").click();
  await page.waitForTimeout(900);
  const mm = await page.locator(".mmenu").boundingBox();
  ok("mobile menu opens from the RIGHT", mm && mm.x + mm.width > 385, JSON.stringify(mm));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector("#shop .g3")).gridTemplateColumns.split(" ").length);
  ok("mobile product grid = 2 columns", cols === 2, String(cols));
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok("no horizontal overflow @390", sw <= 390, String(sw));
  ok("wish heart visible on mobile", +(await page.locator("#shop .wish").first().evaluate((e) => getComputedStyle(e).opacity)) === 1);
  await ctx.close();
}

// ---------- reduced motion ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(base + "/", { waitUntil: "load" });
  const names = await page.evaluate(() => [".ln > span", ".hero video", ".mq-t", ".rv"].map((s) => getComputedStyle(document.querySelector(s)).animationName));
  ok("prefers-reduced-motion disables animations", names.every((n) => n === "none"), names.join());
  await ctx.close();
}

await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
