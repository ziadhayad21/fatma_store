// LIVE end-to-end check of the home redesign against your Supabase project + a running production server:
//   node --env-file=.env.local scripts/home-live.mjs [base] [shotsDir]
// - the reviews section is hidden with 0-2 published reviews and appears at 3
// - reviews are added / edited / hidden / reordered through the REAL admin screens (temporary admin user)
// - the category accent colour is edited in the admin and reaches the home tile (then restored)
// - screenshots of the home page at 1440 and 390
// NOTE: it expects NO other published reviews to exist (it checks that the section is hidden at 0-2): delete the sample reviews first.
// Everything it creates (reviews, temporary admin) is deleted afterwards.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const base = process.argv[2] ?? "http://localhost:3111";
const shots = process.argv[3] ? path.resolve(process.argv[3]) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ""), process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let failed = 0;
const check = (n, ok, x = "") => {
  if (!ok) failed++;
  console.log(ok ? "PASS" : "FAIL", n, ok ? "" : x);
};

const tag = crypto.randomUUID().slice(0, 6);
const email = `home-${tag}@example.com`;
const password = `Pw-${crypto.randomUUID()}`;
const u = await sb.auth.admin.createUser({ email, password, email_confirm: true });
if (u.error) throw u.error;
await sb.rpc("grant_admin", { p_email: email });
const towels = (await sb.from("categories").select("id, accent_color").eq("slug", "towels").single()).data;
const NAMES = [`ZZ-${tag} منى`, `ZZ-${tag} Sara`, `ZZ-${tag} نور`, `ZZ-${tag} هدى`];
const TEXTS = [
  "الفوطة طلعت أحلى من الصور، والاسم مطبوع بخط حلو أوي.",
  "Quality is great and the print did not fade after washing.",
  "اتأخرت يوم بس الشغل يستاهل. المريلة بقت حاجة شبهي.",
  "طلبت هدية لأمي وفرحت بيها جدا، تسلم إيديكم.",
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const visibleReviewsCount = async () => {
  await page.goto(base + "/", { waitUntil: "load" });
  return page.locator("#reviews").count();
};

try {
  // ---- login
  await page.goto(base + "/admin/login", { waitUntil: "load" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((x) => x.pathname === "/admin", { timeout: 20000 });
  await page.waitForSelector('.adm-nav a:has-text("الآراء")', { timeout: 15000 }).then(
    () => check("admin nav has الآراء", true),
    () => check("admin nav has الآراء", false),
  );

  check("no reviews yet: the section is hidden", (await visibleReviewsCount()) === 0);

  // ---- add 4 reviews through the form: 3 published, 1 hidden
  for (let i = 0; i < 4; i++) {
    await page.goto(base + "/admin/reviews/new", { waitUntil: "load" });
    await page.fill("#customer_name", NAMES[i]);
    await page.fill("#text", TEXTS[i]);
    if (i === 0) await page.selectOption("#product_id", { index: 1 });
    if (i === 2) await page.selectOption("#avatar_color", "#141414");
    await page.fill("#sort", String(i));
    if (i < 3) await page.check('input[name="is_published"]');
    await page.click('.adm-form button:text-is("حفظ")');
    await page.waitForURL(/\/admin\/reviews\/[0-9a-f-]{36}\?created=1/, { timeout: 20000 });
    if (i === 1) {
      check("2 published: the section is still hidden", (await visibleReviewsCount()) === 0);
    }
  }
  check("3 published: the section appears", (await visibleReviewsCount()) === 1);

  const sec = page.locator("#reviews");
  const texts = await sec.locator("ul.vh li").allTextContents();
  check("visually-hidden list has the 3 published reviews once (hidden one excluded)", texts.length === 3 && !texts.join("").includes(NAMES[3]), JSON.stringify(texts));
  check("moving rows are aria-hidden", (await sec.locator(".rv-rows").getAttribute("aria-hidden")) === "true");
  const card = sec.locator(".rcard").first();
  const cs = await card.evaluate((e) => {
    const c = getComputedStyle(e);
    return { w: c.width, bg: c.backgroundColor, border: c.borderTopColor, radius: c.borderRadius };
  });
  check("card: 380px white, 1px #E5DED3 border, no radius", cs.w === "380px" && cs.bg === "rgb(255, 255, 255)" && cs.border === "rgb(229, 222, 211)" && cs.radius === "0px", JSON.stringify(cs));
  const av = await sec.locator(".av").first().evaluate((e) => ({ w: e.getBoundingClientRect().width, t: e.textContent }));
  check("avatar 46px with the first letter", av.w === 46 && av.t.length >= 1, JSON.stringify(av));
  check("'اشترت: <product>' line shown for the review that has a product", (await sec.locator(".who-buy").count()) > 0 && (await sec.locator(".who-buy").first().textContent()).startsWith("اشترت:"));
  const lines = await sec.locator(".rtext").first().evaluate((e) => getComputedStyle(e).webkitLineClamp);
  check("review text clamps to 4 lines", String(lines) === "4", String(lines));
  const anim = await sec.locator(".rv-row:not(.rev)").evaluate((e) => getComputedStyle(e).animationDuration);
  const anim2 = await sec.locator(".rv-row.rev").evaluate((e) => getComputedStyle(e).animationDuration + "|" + getComputedStyle(e).animationDirection);
  check("two rows scroll (70s / 80s, opposite directions)", anim === "70s" && anim2.startsWith("80s") && anim2.includes("reverse"), anim + " " + anim2);

  // ---- hide / show / reorder in the admin list
  await page.goto(base + "/admin/reviews", { waitUntil: "load" });
  const rowOf = (n) => page.locator("tbody tr", { hasText: n });
  await rowOf(NAMES[2]).locator('button:has-text("إخفاء")').click();
  await rowOf(NAMES[2]).locator(".adm-badge").waitFor({ timeout: 15000 }); // the list shows "مخفي" once the action finished
  check("hiding a review (3 -> 2 published) hides the whole section immediately", (await visibleReviewsCount()) === 0);
  await page.goto(base + "/admin/reviews", { waitUntil: "load" });
  await rowOf(NAMES[2]).locator('button:has-text("إظهار")').click();
  await rowOf(NAMES[2]).locator(".adm-badge").waitFor({ state: "detached", timeout: 15000 });
  check("showing it again brings the section back immediately", (await visibleReviewsCount()) === 1);

  await page.goto(base + "/admin/reviews", { waitUntil: "load" });
  const order = async () => (await page.locator("tbody tr td:first-child b").allTextContents()).filter((t) => t.startsWith(`ZZ-${tag}`));
  const before = await order();
  await rowOf(NAMES[1]).locator('button[aria-label*="لفوق"]').click();
  await page.waitForFunction((first) => [...document.querySelectorAll("tbody tr td:first-child b")].find((b) => b.textContent.startsWith("ZZ-"))?.textContent !== first, before[0], { timeout: 15000 });
  const after = await order();
  check("moving a review up swaps it with the one above", after[0] === before[1] && after[1] === before[0], JSON.stringify({ before, after }));
  await page.goto(base + "/", { waitUntil: "load" });
  const firstName = await page.locator("#reviews ul.vh li").first().textContent();
  check("the new order reaches the home page", firstName.includes(after.filter((n) => n !== NAMES[3])[0]), firstName);

  // ---- edit text
  await page.goto(base + "/admin/reviews", { waitUntil: "load" });
  await rowOf(NAMES[0]).locator('a:has-text("تعديل")').click();
  await page.fill("#text", "نص معدّل بعد التعديل.");
  await page.click('.adm-form button:text-is("حفظ")');
  await page.waitForSelector('[role="status"]:has-text("اتحفظ")');
  await page.goto(base + "/", { waitUntil: "load" });
  check("an edited review shows the new text on the home page", (await page.locator("#reviews ul.vh").textContent()).includes("نص معدّل بعد التعديل."));

  // ---- category accent colour
  await page.goto(base + `/admin/categories/${towels.id}`, { waitUntil: "load" });
  await page.locator("#accent_color").fill("#123456");
  await page.click('.adm-form button:text-is("حفظ")');
  await page.waitForSelector('[role="status"]:has-text("اتحفظ")');
  await page.goto(base + "/", { waitUntil: "load" });
  const tile = page.locator('a.tile[href="/collections/towels"]');
  const c1 = await tile.evaluate((e) => e.style.getPropertyValue("--tile-c"));
  check("category colour edited in the admin reaches the home tile", c1.toLowerCase() === "#123456", c1);
  await tile.hover();
  await page.waitForTimeout(600);
  const pill = await tile.locator(".tile-go").evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color, r: getComputedStyle(e).borderRadius }));
  check("hovering turns the link into a pill filled with that colour, dark text", pill.bg === "rgb(18, 52, 86)" && pill.color === "rgb(20, 20, 20)" && parseFloat(pill.r) > 20, JSON.stringify(pill));
  await page.goto(base + `/admin/categories/${towels.id}`, { waitUntil: "load" });
  await page.locator("#accent_color").fill(towels.accent_color.toLowerCase());
  await page.click('.adm-form button:text-is("حفظ")');
  await page.waitForSelector('[role="status"]:has-text("اتحفظ")');

  // ---- default colours on the other tiles + doodles + sections order
  await page.goto(base + "/", { waitUntil: "load" });
  const cols = await page.locator("a.tile").evaluateAll((els) => els.map((e) => e.style.getPropertyValue("--tile-c").toLowerCase()));
  check("tile colours: towels #efe6d6, aprons #f6d6dc, bags #f2c94c", JSON.stringify(cols) === JSON.stringify(["#efe6d6", "#f6d6dc", "#f2c94c"]), JSON.stringify(cols));
  const ids = await page.evaluate(() => [...document.querySelectorAll("main > section, main > div, main > *")].map((e) => e.id || e.className.split(" ")[0]));
  check("section order: hero, categories, marquee, reviews, about", JSON.stringify(ids.filter(Boolean)) === JSON.stringify(["hero", "categories", "mq", "reviews", "about"]), JSON.stringify(ids));
  check("removed from home: products / features / custom / towels editorial", (await page.locator("#shop, #custom, .feat, .ed-imgs, .step").count()) === 0);
  check("doodles: underline under القسم and heart in the reviews title", (await page.locator("#categories .mark .doodle").count()) === 1 && (await page.locator("#reviews .mark .doodle").count()) === 1);
  const bg = await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector(".hdr")).backgroundColor, getComputedStyle(document.querySelector(".ftr")).backgroundColor, getComputedStyle(document.querySelector(".reviews")).backgroundColor]);
  check("global look: page #FAF7F2, header rgba(250,247,242,.96), footer #EFE9E0, reviews #F1ECE4", bg[0] === "rgb(250, 247, 242)" && bg[1] === "rgba(250, 247, 242, 0.96)" && bg[2] === "rgb(239, 233, 224)" && bg[3] === "rgb(241, 236, 228)", JSON.stringify(bg));
  const nav = await page.locator(".nav a, .ftr nav[aria-label='تسوّق'] a").evaluateAll((els) => els.map((e) => e.textContent + "→" + e.getAttribute("href")));
  check("nav + footer: حكايتنا → /#about (التخصيص gone)", nav.filter((x) => x.startsWith("حكايتنا→/#about")).length === 2 && !nav.some((x) => x.includes("التخصيص")), JSON.stringify(nav));
  const hero = await page.evaluate(() => ({ b: document.querySelector(".hero-cta .btn").getAttribute("href"), l: document.querySelector(".hero-cta a:not(.btn)").getAttribute("href"), t: document.querySelector(".hero-cta a:not(.btn)").textContent, pause: document.querySelectorAll(".hero-ctl").length }));
  check("hero: تسوّق الآن → #categories, حكايتنا → #about, no pause button", hero.b === "#categories" && hero.l === "#about" && hero.t.trim() === "حكايتنا" && hero.pause === 0, JSON.stringify(hero));
  const mq = await page.evaluate(() => {
    const m = document.querySelector(".mq");
    const items = [...m.querySelectorAll(".mq-item")].slice(0, 6);
    const cs = getComputedStyle(m);
    return { bg: cs.backgroundColor, pad: cs.paddingTop, border: cs.borderTopColor, hidden: m.getAttribute("aria-hidden"), labels: items.map((e) => e.textContent.trim()), weights: [...new Set(items.map((e) => getComputedStyle(e).fontWeight))], sizes: [...new Set(items.map((e) => getComputedStyle(e).fontSize))], iconColor: getComputedStyle(items[0].querySelector("svg")).stroke, dur: getComputedStyle(m.querySelector(".mq-t")).animationDuration };
  });
  check("marquee: white band, 26px padding, #E7E1D7 borders, aria-hidden, 45s", mq.bg === "rgb(255, 255, 255)" && mq.pad === "26px" && mq.border === "rgb(231, 225, 215)" && mq.hidden === "true" && mq.dur === "45s", JSON.stringify(mq));
  check("marquee items: 6 labels in order, one weight (600) and one size, red icon", JSON.stringify(mq.labels) === JSON.stringify(["فوط", "مريلات", "شنط", "باسمك", "بتصميمك", "هدية"]) && mq.weights.join() === "600" && mq.sizes.length === 1 && mq.iconColor === "rgb(193, 18, 31)", JSON.stringify(mq));

  // ---- screenshots (temporary reviews are still there)
  if (shots) {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const c = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
      const p = await c.newPage();
      await p.goto(base + "/", { waitUntil: "load" });
      // full-page screenshots do not scroll: force below-the-fold sections (content-visibility: auto) to render
      await p.addStyleTag({ content: "*{content-visibility:visible!important}" });
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(900);
      await p.screenshot({ path: path.join(shots, `home-${w}.png`), fullPage: true });
      await c.close();
    }
  }
  check("no page errors", errors.length === 0, errors.join(" | "));
} finally {
  // hide the test reviews through the admin first: that expires the home-page cache like a real edit.
  // (deleting rows straight in the database would leave them visible on the home page for up to 5 minutes)
  try {
    await page.goto(base + "/admin/reviews", { waitUntil: "load" });
    for (let i = 0; i < 6; i++) {
      const hide = page.locator("tbody tr", { hasText: `ZZ-${tag}` }).locator('button:has-text("إخفاء")').first();
      if (!(await hide.count())) break;
      await hide.click();
      await page.waitForTimeout(1200);
    }
  } catch (e) {
    console.error("cleanup through the admin failed:", e.message);
  }
  await browser.close();
  await sb.from("reviews").delete().like("customer_name", `ZZ-${tag}%`);
  await sb.from("categories").update({ accent_color: towels.accent_color }).eq("id", towels.id);
  await sb.auth.admin.deleteUser(u.data.user.id);
  const left = (await sb.from("reviews").select("id", { count: "exact", head: true })).count;
  console.log("reviews left in the table after cleanup:", left);
}
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
