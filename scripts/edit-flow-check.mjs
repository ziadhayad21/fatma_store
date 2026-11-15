// Cart "عدّل" flow + checkout form behaviour. Runs without a backend (seed mode); real
// uploads / orders need Supabase and are covered by unit tests + the manual checklist in the README.
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

const vis = (sel) => page.locator(`${sel} >> visible=true`);
const addBtn = vis(".info .btn-d");
async function addName(text, fontIdx, qty = 1) {
  await page.goto(base + "/products/chef-apron", { waitUntil: "load" });
  await vis(".opt").nth(1).click();
  await vis("#nm").fill(text);
  await vis(".fo").nth(fontIdx).click();
  for (let i = 1; i < qty; i++) await page.getByRole("button", { name: "زوّد" }).click();
  await addBtn.click();
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
}
async function addDesign(file) {
  await page.goto(base + "/products/polka-dot-bag", { waitUntil: "load" });
  await vis(".opt").nth(2).click();
  await page.locator('input[type="file"]').setInputFiles({ name: file, mimeType: "image/png", buffer: PNG });
  await page.waitForFunction(() => document.querySelector(".file-row")?.textContent?.includes("اترفع بنجاح"));
  await addBtn.click();
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
}

await addName("Fatma", 1, 2); // kufi x2
await addDesign("logo.png");

await page.goto(base + "/cart", { waitUntil: "load" });
await page.waitForTimeout(700);
ok("cart has 2 lines", (await page.locator(".row").count()) === 2);
const hrefs = await page.locator(".row a.rm").evaluateAll((a) => a.map((x) => x.getAttribute("href")));
ok("عدّل links carry ?edit=<line key>", hrefs.every((h) => h.includes("?edit=")), hrefs[0]);

// ---------- edit the name line ----------
await page.locator(".row").first().getByRole("link", { name: "عدّل" }).click();
await page.waitForURL(/edit=/);
await vis("#nm").waitFor();
ok("pre-filled: name option selected", (await vis(".opt").nth(1).getAttribute("aria-pressed")) === "true");
ok("pre-filled: name text", (await vis("#nm").inputValue()) === "Fatma");
ok("pre-filled: font tile (kufi)", (await vis(".fo").nth(1).getAttribute("aria-pressed")) === "true");
ok("pre-filled: quantity 2", (await vis(".info .qty span").textContent()) === "2");
ok("edit banner + save button label", (await page.getByText("بتعدّل المنتج ده في السلة").count()) === 1 && (await addBtn.textContent())?.includes("حفظ التعديلات"));

await vis("#nm").fill("Sara");
await vis(".fo").nth(2).click();
await addBtn.click();
await page.waitForURL(/\/cart$/);
await page.waitForTimeout(700);
const rows = await page.locator(".row").allTextContents();
ok("saved back to the SAME line (still 2 rows, order kept)", rows.length === 2 && rows[0].includes("Sara") && rows[0].includes("خط نسخ") && !rows[0].includes("Fatma"), rows[0].replace(/\s+/g, " ").slice(0, 90));
ok("quantity preserved", (await page.locator(".row").first().locator(".qty span").textContent()) === "2");

// ---------- edit the design line ----------
await page.locator(".row").nth(1).getByRole("link", { name: "عدّل" }).click();
await vis(".file-row").waitFor();
ok("pre-filled: design option + file row", (await vis(".opt").nth(2).getAttribute("aria-pressed")) === "true" && ((await vis(".file-row").textContent()) ?? "").includes("logo.png"));
await vis(".opt").nth(0).click(); // switch to standard
await addBtn.click();
await page.waitForURL(/\/cart$/);
await page.waitForTimeout(700);
const rows2 = await page.locator(".row").allTextContents();
ok("design line became a standard line (2 rows)", rows2.length === 2 && rows2[1].includes("زي ما هو"), rows2[1].replace(/\s+/g, " ").slice(0, 80));

// ---------- collision merges ----------
await page.locator(".row").first().getByRole("link", { name: "عدّل" }).click();
await vis("#nm").waitFor();
await vis(".opt").nth(0).click(); // make it identical to the standard polka-dot? (different product) -> no merge
await addBtn.click();
await page.waitForURL(/\/cart$/);
await page.waitForTimeout(600);
ok("different product never merges", (await page.locator(".row").count()) === 2);

// identical-after-edit on the same product merges
await page.goto(base + "/products/chef-apron", { waitUntil: "load" });
await addBtn.click(); // standard chef apron again -> merges with existing standard chef line (qty 3 total)
await page.waitForTimeout(500);
await page.keyboard.press("Escape");
await page.goto(base + "/products/chef-apron", { waitUntil: "load" });
await vis(".opt").nth(1).click();
await vis("#nm").fill("Zed");
await addBtn.click();
await page.waitForTimeout(500);
await page.keyboard.press("Escape");
await page.goto(base + "/cart", { waitUntil: "load" });
await page.waitForTimeout(600);
const before = await page.locator(".row").count();
// edit the "Zed" line back to standard -> collides with the standard chef line -> merged
const zed = page.locator(".row", { hasText: "Zed" });
await zed.getByRole("link", { name: "عدّل" }).click();
await vis("#nm").waitFor();
await vis(".opt").nth(0).click();
await addBtn.click();
await page.waitForURL(/\/cart$/);
await page.waitForTimeout(600);
ok("edit that becomes identical to another line merges into it", (await page.locator(".row").count()) === before - 1 && (await page.locator(".row", { hasText: "Zed" }).count()) === 0);

// stale / missing edit key falls back to a normal add form
await page.goto(base + "/products/chef-apron?edit=does-not-exist", { waitUntil: "load" });
await page.waitForTimeout(500);
ok("unknown edit key -> normal 'add to cart' form", ((await addBtn.textContent()) ?? "").includes("أضف للسلة") && (await page.getByText("بتعدّل المنتج ده").count()) === 0);

// persisted after reload while editing
await page.goto(base + "/cart", { waitUntil: "load" });
await page.waitForTimeout(500);
const href = await page.locator(".row a.rm").first().getAttribute("href");
await page.goto(base + href, { waitUntil: "load" });
await page.waitForTimeout(800);
ok("edit link works on a fresh page load (after hydration)", (await page.getByText("بتعدّل المنتج ده في السلة").count()) === 1);

// ---------- checkout form ----------
await page.goto(base + "/checkout", { waitUntil: "load" });
await page.waitForTimeout(700);
ok("checkout: single pre-selected COD method", (await page.locator('input[name="payment"]').count()) === 1 && (await page.locator('input[name="payment"]').isChecked()) && (await page.getByText("الدفع عند الاستلام").count()) >= 1);
ok("checkout: all 27 governorates listed", (await page.locator("select option").count()) === 28);
ok("checkout: summary lists lines", (await page.locator(".sum-line").count()) >= 1);
await page.getByRole("button", { name: /تأكيد الطلب/ }).click();
ok("checkout: empty submit shows Arabic field errors", (await page.locator(".fld .err").count()) >= 4);
ok("checkout: focus moves to first invalid field", (await page.evaluate(() => document.activeElement?.getAttribute("name"))) === "name");
await page.fill('input[name="name"]', "فاطمة أحمد");
await page.fill('input[name="phone"]', "01312345678");
await page.getByRole("button", { name: /تأكيد الطلب/ }).click();
ok("checkout: bad mobile prefix rejected", ((await page.locator("#" + (await page.locator('input[name="phone"]').getAttribute("id")) + "-e").textContent()) ?? "").includes("موبايل"));
const hp = await page.locator(".hp input").boundingBox();
ok("checkout: honeypot field is off-screen and aria-hidden", !!hp && Math.abs(hp.x) > 5000 && (await page.locator(".hp").getAttribute("aria-hidden")) === "true");

// newsletter (no backend in seed mode)
await page.goto(base + "/", { waitUntil: "load" });
await page.fill("#nl-mail", "not-an-email");
await page.getByRole("button", { name: "اشترك" }).click();
await page.waitForSelector("footer [role=status]");
ok("newsletter: invalid email message", ((await page.locator("footer [role=status]").textContent()) ?? "").includes("بريد"));

ok("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
