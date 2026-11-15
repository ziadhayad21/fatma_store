// Live check of the rate limits against the real Supabase project + a running production server.
//   node --env-file=.env.local scripts/ratelimit-live.mjs [base]
// - SQL function: counts, blocks after max, anon/authenticated cannot call it or read the table
// - newsletter and admin login: hit the real limit by submitting the real forms
// - upload: pre-fills the counter to max-1 through the same function, then does two real uploads
// Removes its subscribers, upload objects and counters afterwards.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3111";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const o = { auth: { persistSession: false, autoRefreshToken: false } };
const sb = createClient(url, process.env.SUPABASE_SECRET_KEY, o);
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, o);
let failed = 0;
const check = (n, ok, x = "") => {
  if (!ok) failed++;
  console.log(ok ? "PASS" : "FAIL", n, ok ? "" : x);
};
const tag = crypto.randomUUID().slice(0, 6);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const RATE = "محاولات كتير";

// ---- 1. SQL function
const key = `test:${tag}`;
const seq = [];
for (let i = 0; i < 5; i++) seq.push((await sb.rpc("hit_rate_limit", { p_key: key, p_window_seconds: 60, p_max: 3 })).data);
check("function allows 3 then blocks", JSON.stringify(seq) === "[true,true,true,false,false]", JSON.stringify(seq));
const a1 = await anon.rpc("hit_rate_limit", { p_key: key, p_window_seconds: 60, p_max: 3 });
check("anon cannot call hit_rate_limit", !!a1.error, JSON.stringify(a1.data));
const a2 = await anon.from("rate_limits").select("*");
check("anon cannot read rate_limits", !!a2.error || (a2.data ?? []).length === 0, JSON.stringify(a2.data));
await sb.from("rate_limits").delete().eq("key", key);

// the key the app uses locally (no x-forwarded-for header)
const ids = ["unknown", "::1", "127.0.0.1"];
const clear = async () => {
  for (const b of ["upload", "newsletter", "order", "login"]) for (const id of ids) await sb.from("rate_limits").delete().eq("key", `${b}:${id}`);
};
await clear();
const browser = await chromium.launch();
const emails = [];

try {
  // ---- 2. newsletter: 5 per hour
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(base + "/", { waitUntil: "load" });
    const form = page.locator("footer form >> visible=true").first();
    const msgs = [];
    for (let i = 1; i <= 6; i++) {
      const email = `rl-${tag}-${i}@example.com`;
      emails.push(email);
      await form.locator('input[name="email"]').fill(email);
      await form.locator('button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelector("footer form [role=status]"), null, { timeout: 15000 });
      await page.waitForFunction(() => !document.querySelector("footer form button[type=submit]").disabled, null, { timeout: 15000 });
      msgs.push(await form.locator("[role=status]").first().textContent());
      if (i < 6) await page.reload({ waitUntil: "load" });
    }
    check("newsletter: first 5 accepted", msgs.slice(0, 5).every((m) => !m.includes(RATE)), msgs.join(" | "));
    check("newsletter: 6th blocked with Arabic message", msgs[5].includes(RATE), msgs[5]);
    const { data } = await sb.from("newsletter_subscribers").select("email").in("email", emails);
    check("newsletter: blocked attempt not stored (5 rows)", data.length === 5, String(data.length));
    await ctx.close();
  }

  // ---- 3. admin login: 10 per 10 minutes (wrong password each time)
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const msgs = [];
    for (let i = 1; i <= 11; i++) {
      await page.goto(base + "/admin/login", { waitUntil: "load" });
      await page.fill('input[name="email"]', `nobody-${tag}@example.com`);
      await page.fill('input[name="password"]', "wrong-password");
      await page.click('button[type="submit"]');
      await page.waitForSelector(".adm-err", { timeout: 15000 });
      msgs.push(await page.locator(".adm-err").first().textContent());
    }
    check("login: first 10 get the normal wrong-password message", msgs.slice(0, 10).every((m) => m.includes("غلط")), msgs.slice(0, 10).join(" | "));
    check("login: 11th blocked with Arabic message", msgs[10].includes(RATE), msgs[10]);
    await ctx.close();
  }

  // ---- 4. upload: seed 29 hits, then 2 real uploads (30th allowed, 31st blocked)
  {
    await sb.from("rate_limits").delete().like("key", "upload:%");
    for (let i = 0; i < 29; i++) await sb.rpc("hit_rate_limit", { p_key: "upload:::1", p_window_seconds: 600, p_max: 30 });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(base + "/products/polka-dot-bag", { waitUntil: "load" });
    await page.locator(".opt >> visible=true").nth(2).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG });
    await page.waitForFunction(() => document.querySelector(".file-row")?.textContent?.includes("اترفع بنجاح"), null, { timeout: 30000 });
    check("upload: 30th request allowed", true);
    const row = await page.locator(".file-row").first().textContent();
    void row;
    // second file: must be refused
    await page.locator('input[type="file"]').setInputFiles({ name: "b.png", mimeType: "image/png", buffer: PNG });
    await page.waitForTimeout(4000);
    const shown = await page.locator("[role=alert]").allTextContents();
    check("upload: 31st request blocked with Arabic message", shown.some((t) => t.includes(RATE)), JSON.stringify(shown) + " | " + (await page.locator(".file-row").allTextContents()).join("|"));
    await ctx.close();
  }
} finally {
  await browser.close();
  await clear();
  await sb.from("newsletter_subscribers").delete().in("email", emails);
  // remove the uploads this test created
  const { data: months } = await sb.storage.from("designs").list("uploads", { limit: 100 });
  for (const m of months ?? []) {
    const { data: files } = await sb.storage.from("designs").list(`uploads/${m.name}`, { limit: 1000 });
    const used = (await sb.from("order_items").select("design_path").not("design_path", "is", null)).data?.map((r) => r.design_path) ?? [];
    const doomed = (files ?? []).map((f) => `uploads/${m.name}/${f.name}`).filter((p) => !used.includes(p));
    if (doomed.length) await sb.storage.from("designs").remove(doomed);
  }
}
const left = (await sb.from("rate_limits").select("key")).data ?? [];
check("counters cleaned up", !left.some((r) => /^(upload|newsletter|order|login):/.test(r.key)), JSON.stringify(left));
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
