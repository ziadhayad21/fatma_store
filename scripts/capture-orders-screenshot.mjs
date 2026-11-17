import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const base = "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const sb = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const tag = crypto.randomUUID().slice(0, 6);
const adminEmail = `screenshot-admin-${tag}@example.com`;
const adminPw = `Pw-${crypto.randomUUID()}`;

try {
  const u = await sb.auth.admin.createUser({ email: adminEmail, password: adminPw, email_confirm: true });
  if (u.error) throw u.error;
  await sb.rpc("grant_admin", { p_email: adminEmail });

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${base}/admin/login`, { waitUntil: "load" });
  await page.locator("#email").fill(adminEmail);
  await page.locator("#password").fill(adminPw);
  await page.getByRole("button", { name: "دخول" }).click();
  await page.waitForURL(/\/admin$/, { timeout: 20000 });

  await page.goto(`${base}/admin/orders`, { waitUntil: "networkidle" });
  await page.screenshot({ path: "orders-table-updated.png", fullPage: false });
  console.log("Screenshot saved to orders-table-updated.png");

  await browser.close();
  await sb.auth.admin.deleteUser(u.data.user.id);
} catch (e) {
  console.error(e);
}
