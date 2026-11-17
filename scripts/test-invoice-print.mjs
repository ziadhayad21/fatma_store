import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const base = "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const sb = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const tag = crypto.randomUUID().slice(0, 6);
const adminEmail = `test-print-${tag}@example.com`;
const adminPw = `Pw-${crypto.randomUUID()}`;

let failed = 0;
const check = (name, pass, extra = "") => {
  if (!pass) failed++;
  console.log(pass ? "✓ PASS:" : "✗ FAIL:", name, pass ? "" : extra);
};

const cleanup = { users: [], orders: [] };

try {
  // Create admin user
  const u = await sb.auth.admin.createUser({ email: adminEmail, password: adminPw, email_confirm: true });
  if (u.error) throw u.error;
  cleanup.users.push(u.data.user.id);
  await sb.rpc("grant_admin", { p_email: adminEmail });

  // Get a product for the order
  const { data: prods } = await sb.from("products").select("id, name_ar, base_price").limit(2);
  const p1 = prods[0];
  const p2 = prods[1] ?? prods[0];

  // Create an order with both discounted and regular items
  const r = await sb.rpc("create_order", {
    p_order: {
      customer_name: `عميل تجربة الفاتورة ${tag}`,
      phone: "01099887766",
      governorate: "القاهرة",
      area: "المعادي",
      address: "شارع 10 عمارة 4",
      notes: "يرجى الاتصال قبل الوصول",
      payment_method: "cod",
      subtotal: 250,
      shipping: 50,
      total: 300,
    },
    p_items: [
      {
        product_id: p1.id,
        name_snapshot: p1.name_ar,
        mode: "standard",
        unit_price: 100,
        qty: 1,
        original_unit_price: 150,
        discount_percent: 33.33,
      },
      {
        product_id: p2.id,
        name_snapshot: p2.name_ar,
        mode: "name",
        text: "فاطمة",
        font: "ruqaa",
        unit_price: 150,
        qty: 1,
      },
    ],
  });
  if (r.error) throw r.error;
  const orderId = r.data.id;
  cleanup.orders.push(orderId);

  // Launch browser and test (use system Edge or Chrome)
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login as admin
  await page.goto(`${base}/admin/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', adminEmail);
  await page.fill('input[name="password"]', adminPw);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);

  // Go to the order details page
  await page.goto(`${base}/admin/orders/${orderId}`, { waitUntil: "networkidle" });

  // 1. Verify Print Invoice button exists and is visible
  const printBtn = page.locator(".adm-print-invoice-btn");
  const isVisible = await printBtn.isVisible();
  check("Print Invoice button is visible", isVisible);

  const btnText = (await printBtn.textContent()).trim();
  check("Button text is 'طباعة الفاتورة'", btnText.includes("طباعة الفاتورة"), btnText);

  // 2. Verify Printer Icon is present
  const icon = printBtn.locator("svg");
  const hasIcon = await icon.isVisible();
  check("Printer icon is inside the button", hasIcon);

  // 3. Spy on window.print and click the button
  await page.evaluate(() => {
    window.__printed = false;
    window.print = () => {
      window.__printed = true;
    };
  });
  await printBtn.click();
  const wasPrinted = await page.evaluate(() => window.__printed);
  check("Clicking button triggers window.print()", wasPrinted);

  // 4. Verify Print Media CSS: in print mode, invoice is visible and admin UI is hidden
  await page.emulateMedia({ media: "print" });
  const invoiceDisplay = await page.locator(".adm-invoice").evaluate((el) => getComputedStyle(el).display);
  check("In @media print, .adm-invoice is displayed", invoiceDisplay !== "none", invoiceDisplay);

  const screenDisplay = await page.locator(".adm-order-screen").evaluate((el) => getComputedStyle(el).display);
  check("In @media print, .adm-order-screen is hidden", screenDisplay === "none", screenDisplay);

  const sideDisplay = await page.locator(".adm-side").evaluate((el) => getComputedStyle(el).display);
  check("In @media print, .adm-side sidebar is hidden", sideDisplay === "none", sideDisplay);

  // 5. Verify invoice contains correct data
  const invoiceHtml = await page.locator(".adm-invoice").innerHTML();
  check("Invoice contains order number", invoiceHtml.includes(`#${r.data.number}`));
  check("Invoice contains customer name", invoiceHtml.includes("عميل تجربة الفاتورة"));
  check("Invoice contains discount column/calculation", invoiceHtml.includes("الخصم") && invoiceHtml.includes("-33.33%"));
  check("Invoice contains products", invoiceHtml.includes(p1.name_ar));

  // 6. Test on Mobile viewport (iPhone 12: 390x844)
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileVisible = await printBtn.isVisible();
  check("Print Invoice button is visible on mobile viewport (iPhone 12 width: 390px)", mobileVisible);

  await browser.close();
} finally {
  for (const id of cleanup.orders) {
    await sb.from("orders").delete().eq("id", id);
  }
  for (const uid of cleanup.users) {
    await sb.auth.admin.deleteUser(uid);
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed!`);
  process.exit(1);
} else {
  console.log("\nAll invoice print checks PASSED!");
}
