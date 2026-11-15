// Runs another script while a TEMPORARY shipping fee for القاهرة is set through the real admin form
// (so the storefront cache is invalidated exactly like in production), then clears it the same way.
//   node --env-file=.env.local scripts/with-fee.mjs <script.mjs> [args...]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";

const base = process.env.BASE ?? "http://localhost:3111";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ""), process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = `fee-${crypto.randomUUID().slice(0, 6)}@example.com`;
const password = `Pw-${crypto.randomUUID()}`;
const u = await sb.auth.admin.createUser({ email, password, email_confirm: true });
if (u.error) throw u.error;
await sb.rpc("grant_admin", { p_email: email });

const browser = await chromium.launch();
async function setFee(value) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(base + "/admin/login", { waitUntil: "load" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${base}/admin`, { timeout: 20000 });
  await page.goto(base + "/admin/shipping", { waitUntil: "load" });
  await page.fill('input[name="fee:القاهرة"]', value);
  await page.click('button:text-is("حفظ الأسعار")');
  await page.waitForTimeout(2500);
  await ctx.close();
}
let code = 1;
try {
  await setFee("40");
  code = spawnSync(process.execPath, ["--env-file=.env.local", ...process.argv.slice(2)], { stdio: "inherit" }).status ?? 1;
} finally {
  await setFee("").catch((e) => console.error("could not clear fee:", e.message));
  await browser.close();
  await sb.auth.admin.deleteUser(u.data.user.id);
  const { data } = await sb.from("shipping_rates").select("fee").eq("governorate", "القاهرة").single();
  console.log("fee after cleanup:", data.fee);
}
process.exit(code);
