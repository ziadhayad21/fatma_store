import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const base = "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const sb = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const tag = crypto.randomUUID().slice(0, 6);
const adminEmail = `orders-test-${tag}@example.com`;
const adminPw = `Pw-${crypto.randomUUID()}`;

let failed = 0;
const check = (name, pass, extra = "") => {
  if (!pass) failed++;
  console.log(pass ? "✓ PASS:" : "✗ FAIL:", name, pass ? "" : extra);
};

const cleanup = { users: [], orders: [] };

try {
  // 1. Create temporary admin
  const u = await sb.auth.admin.createUser({ email: adminEmail, password: adminPw, email_confirm: true });
  if (u.error) throw u.error;
  cleanup.users.push(u.data.user.id);
  await sb.rpc("grant_admin", { p_email: adminEmail });

  // 2. Fetch product for sample order
  const { data: prods } = await sb.from("products").select("id, name_ar").limit(1);
  const p1 = prods[0];

  // 3. Create sample order
  const r = await sb.rpc("create_order", {
    p_order: {
      customer_name: `عميل تجربة الجدول ${tag}`,
      phone: "01012349999",
      governorate: "القاهرة",
      area: "المعادي",
      address: "شارع 9 عمارة 15 شقة 4",
      notes: "تسليم باليد",
      payment_method: "cod",
      subtotal: 200,
      shipping: 50,
      total: 250,
    },
    p_items: [
      { product_id: p1.id, name_snapshot: p1.name_ar, mode: "standard", unit_price: 200, qty: 1 },
    ],
  });
  if (r.error) throw r.error;
  const orderId = r.data.id;
  cleanup.orders.push(orderId);

  // 4. Launch browser
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login
  await page.goto(`${base}/admin/login`, { waitUntil: "load" });
  await page.locator("#email").fill(adminEmail);
  await page.locator("#password").fill(adminPw);
  await page.getByRole("button", { name: "دخول" }).click();
  await page.waitForURL(/\/admin$/, { timeout: 20000 });

  // Navigate to orders list
  await page.goto(`${base}/admin/orders`, { waitUntil: "load" });
  await page.waitForSelector(".adm-orders-table");

  // Verify "Save Status" / "حفظ الحالة" button is completely gone
  const saveBtn = page.locator('button:has-text("حفظ الحالة")');
  const saveBtnCount = await saveBtn.count();
  check("No 'حفظ الحالة' button exists on page", saveBtnCount === 0, `found ${saveBtnCount}`);

  // Verify table headers
  const headers = (await page.locator(".adm-orders-table th").allTextContents()).map(h => h.trim());
  check("Table has 'الإجراءات' column", headers.includes("الإجراءات"), JSON.stringify(headers));
  check("Table has 'الحالة' column", headers.includes("الحالة"), JSON.stringify(headers));

  // Find our test order row
  const row = page.locator(`tr:has(a[href*="${orderId}"])`);
  await row.waitFor({ timeout: 10000 });

  // Verify "View Details" / "عرض التفاصيل" button is present
  const viewBtn = row.locator(".adm-view-order-btn");
  const hasViewBtn = await viewBtn.isVisible();
  check("'عرض التفاصيل' button exists for order", hasViewBtn);

  // Verify status dropdown exists and has correct status
  const select = row.locator(".adm-status-select");
  const currentVal = await select.inputValue();
  check("Order status select has 'new'", currentVal === "new", currentVal);

  // Test selecting a new status -> confirmation dialog should open!
  const dialog = row.locator(".adm-status-dialog");
  check("Dialog starts closed", !(await dialog.isVisible()));

  // Select "delivered" (وصل)
  await select.selectOption("delivered");
  await page.waitForTimeout(300);

  const isDialogOpen = await dialog.isVisible();
  check("Confirmation dialog appears on selecting new status", isDialogOpen);

  const dialogText = await dialog.textContent();
  check("Dialog asks to confirm change to وصل", dialogText.includes("وصل") && dialogText.includes("تأكيد تغيير حالة الطلب"), dialogText);

  // Test cancel
  const cancelBtn = dialog.locator('button:has-text("إلغاء")');
  await cancelBtn.click();
  await page.waitForTimeout(300);

  check("Dialog closes after cancel", !(await dialog.isVisible()));
  const resetVal = await select.inputValue();
  check("Select resets back to original value ('new') on cancel", resetVal === "new", resetVal);

  // Now test confirm changing to "prepared" (بيجهز)
  await select.selectOption("prepared");
  await page.waitForTimeout(300);
  const confirmBtn = dialog.locator('button[type="submit"]');
  await confirmBtn.click();
  await page.waitForTimeout(1500);

  // Verify status updated in DB / page
  const updatedSelect = page.locator(`tr:has(a[href*="${orderId}"]) .adm-status-select`);
  const newVal = await updatedSelect.inputValue();
  check("Status successfully updated to 'prepared'", newVal === "prepared", newVal);

  // Test "View Details" navigation
  await viewBtn.click();
  await page.waitForURL(new RegExp(`/admin/orders/${orderId}`));
  check("Navigated to Order Details page", page.url().includes(`/admin/orders/${orderId}`));

  // In Order Details: verify "طباعة الفاتورة" button is visible!
  const printBtn = page.locator(".adm-print-invoice-btn");
  const isPrintVisible = await printBtn.isVisible();
  check("Print Invoice button is visible in Order Details", isPrintVisible);
  const printBtnText = (await printBtn.textContent()).trim();
  check("Button says 'طباعة الفاتورة'", printBtnText.includes("طباعة الفاتورة"), printBtnText);

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
  console.log("\nALL ORDERS TABLE & PRINT INVOICE CHECKS PASSED!");
}
