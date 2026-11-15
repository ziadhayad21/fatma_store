// End-to-end checks for the personalization UI + cart rules. usage: node scripts/personalization-check.mjs [base]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3111";
const results = [];
const ok = (name, pass, extra = "") => {
  results.push(pass);
  console.log(pass ? "PASS" : "FAIL", name, extra);
};

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

// fonts must not be requested on non-product pages
const fontReqs = [];
page.on("request", (r) => /\.woff2?($|\?)/.test(r.url()) && fontReqs.push(r.url()));
await page.goto(base + "/", { waitUntil: "load" });
const homeFonts = fontReqs.length;
await page.goto(base + "/products/chef-apron", { waitUntil: "load" });
const beforePanel = fontReqs.length;

const add = page.locator(".info .btn-d");
const drawer = page.locator(".drawer");
const closeDrawer = async () => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
};

// ---------- name mode ----------
await page.locator(".opt").nth(1).click();
ok("name panel appears", (await page.locator("#nm").count()) === 1);
ok("5 font tiles with aria-pressed", (await page.locator(".fo[aria-pressed]").count()) === 5);
ok("tiles show fallback sample 'فاطمة' when empty", (await page.locator(".fo .s").first().textContent()) === "فاطمة");
ok("add disabled until name typed", await add.isDisabled());
await page.fill("#nm", "Fatma");
ok("add enabled after name", await add.isEnabled());
ok("counter 5/18", (await page.locator(".panel .lbl span.muted").textContent())?.trim() === "5/18");
ok("tiles render typed name", (await page.locator(".fo .s").nth(2).textContent()) === "Fatma");
await page.waitForTimeout(1200);
const ffs = await page.locator(".fo .s").evaluateAll((els) => els.map((e) => getComputedStyle(e).fontFamily));
ok("each tile has a different font family", new Set(ffs).size === 5, ffs.map((f) => f.split(",")[0]).join(" | "));
const loaded = await page.evaluate(async () => {
  await document.fonts.ready;
  return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family);
});
console.log("INFO loaded font families:", [...new Set(loaded)].join(", "));
ok("name fonts load only after the panel renders them", homeFonts <= beforePanel && fontReqs.length > beforePanel, `home ${homeFonts}, product-before-panel ${beforePanel}, after ${fontReqs.length}`);

await page.fill("#nm", "ا".repeat(25));
ok("name capped at 18 chars", (await page.inputValue("#nm")).length === 18);
await page.fill("#nm", "Fatma");
await page.locator(".fo").nth(1).click();
ok("font tile toggles aria-pressed", (await page.locator(".fo").nth(1).getAttribute("aria-pressed")) === "true" && (await page.locator(".fo").nth(0).getAttribute("aria-pressed")) === "false");
ok("price shows +print fee (125)", (await page.locator(".info .price").first().textContent())?.includes("125"));

await add.click();
await page.waitForTimeout(800);
ok("drawer opens with variant text", (await drawer.textContent())?.includes("باسم «Fatma» — خط كوفي") ?? false);
ok("line price uses fee (125)", (await drawer.locator(".dr-row .price").first().textContent())?.includes("125") ?? false);
await closeDrawer();

// identical personalization merges
await add.click();
await page.waitForTimeout(800);
ok("identical line merges (qty 2, one row)", (await drawer.locator(".dr-row").count()) === 1 && (await drawer.locator(".qty span").first().textContent()) === "2");
await closeDrawer();

// different font -> separate line
await page.locator(".fo").nth(0).click();
await add.click();
await page.waitForTimeout(800);
ok("different font = separate line", (await drawer.locator(".dr-row").count()) === 2);
await closeDrawer();

// standard mode
await page.locator(".opt").nth(0).click();
ok("standard: add enabled, panels gone", (await add.isEnabled()) && (await page.locator(".panel").count()) === 0);
await add.click();
await page.waitForTimeout(800);
ok("standard line is separate (3 rows)", (await drawer.locator(".dr-row").count()) === 3);
ok("standard variant text", (await drawer.textContent())?.includes("زي ما هو") ?? false);
await closeDrawer();

// ---------- design mode ----------
await page.locator(".opt").nth(2).click();
ok("dropzone shown, add disabled", (await page.locator(".drop").count()) === 1 && (await add.isDisabled()));
const input = page.locator('input[type="file"]');
await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
ok("wrong type -> Arabic error", ((await page.locator('.err').textContent()) ?? "").includes("PNG"));
await input.setInputFiles({ name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(11 * 1024 * 1024) });
ok("oversize -> Arabic error", ((await page.locator('.err').textContent()) ?? "").includes("10"));
ok("still no upload, add disabled", (await page.locator(".file-row").count()) === 0 && (await add.isDisabled()));

await input.setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
await page.waitForSelector(".file-row");
const sawProgress = (await page.locator(".file-row").textContent())?.includes("بيترفع") || (await page.locator(".file-row").textContent())?.includes("اترفع");
await page.waitForFunction(() => document.querySelector(".file-row")?.textContent?.includes("اترفع بنجاح"));
ok("upload row: name + 'اترفع بنجاح'", sawProgress && (await page.locator(".file-row").textContent())?.includes("logo.png") && (await page.locator(".file-row").textContent())?.includes("اترفع بنجاح"));
ok("row has غيّره + شيل", (await page.getByRole("button", { name: "غيّره" }).count()) === 1 && (await page.getByRole("button", { name: "شيل" }).count()) >= 1);
ok("error cleared after valid file", (await page.locator('.err').count()) === 0);
ok("add enabled after upload", await add.isEnabled());
await add.click();
await page.waitForTimeout(800);
ok("drawer shows 'بتصميمك: logo.png'", (await drawer.textContent())?.includes("بتصميمك: logo.png") ?? false);
await closeDrawer();

// change file via غيّره
const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "غيّره" }).click()]);
await chooser.setFiles({ name: "second.webp", mimeType: "image/webp", buffer: PNG });
await page.waitForFunction(() => document.querySelector(".file-row")?.textContent?.includes("second.webp") && document.querySelector(".file-row")?.textContent?.includes("اترفع بنجاح"));
ok("غيّره replaces the file", true);

// remove
await page.locator(".file-row").getByRole("button", { name: "شيل" }).click();
ok("شيل returns dropzone and disables add", (await page.locator(".drop").count()) === 1 && (await add.isDisabled()));

// drag & drop
await page.evaluate(
  async ([b64]) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "dropped.jpg", { type: "image/jpeg" }));
    const el = document.querySelector(".drop");
    el.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    el.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
  },
  [PNG.toString("base64")],
);
await page.waitForFunction(() => document.querySelector(".file-row")?.textContent?.includes("dropped.jpg"));
ok("drag & drop works", true);

// switching modes keeps entered state
await page.locator(".opt").nth(1).click();
ok("name state preserved when switching modes", (await page.inputValue("#nm")) === "Fatma");
await page.locator(".opt").nth(2).click();
ok("upload state preserved when switching modes", (await page.locator(".file-row").textContent())?.includes("dropped.jpg") ?? false);

// ---------- cart page ----------
await page.goto(base + "/cart", { waitUntil: "load" });
await page.waitForTimeout(800);
ok("cart page: separate lines persisted (4)", (await page.locator(".row").count()) === 4, String(await page.locator(".row").count()));
const totals = await page.locator(".sum .sl").allTextContents();
console.log("INFO summary:", totals.map((t) => t.replace(/\s+/g, " ").trim()).join(" | "));
ok("no discount field", (await page.getByText("كود خصم").count()) === 0);
// qty limits
const row = page.locator(".row").first();
for (let i = 0; i < 52; i++) {
  const inc = row.getByRole("button", { name: "زوّد" });
  if (await inc.isDisabled()) break;
  await inc.click();
}
ok("qty stops at 50 (+ disabled)", (await row.locator(".qty span").textContent()) === "50" && (await row.getByRole("button", { name: "زوّد" }).isDisabled()));
const dec = row.getByRole("button", { name: "قلّل" });
for (let i = 0; i < 60; i++) {
  if (await dec.isDisabled()) break;
  await dec.click();
}
ok("qty stops at 1 (- disabled)", (await row.locator(".qty span").textContent()) === "1" && (await dec.isDisabled()));
await row.getByRole("button", { name: "شيل" }).click();
ok("remove line", (await page.locator(".row").count()) === 3);

ok("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
