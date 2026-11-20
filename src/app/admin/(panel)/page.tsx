import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CleanupCard } from "@/components/admin/CleanupCard";
import { StorageUsageCard } from "@/components/admin/StorageUsageCard";
import { requireAdmin } from "@/lib/admin/auth";
import { readStorageUsage } from "@/lib/storage";
import { readDashboardSales } from "@/lib/admin/dashboard-sales";
import { adminDateKey, formatDay } from "@/lib/admin/format";
import { formatPrice } from "@/lib/format";
import { governorates } from "@/lib/governorates";
import { isOrderStatus, ORDER_STATUSES, type OrderStatus } from "@/lib/order-status";

export const metadata = { title: "Dashboard | Fatima Admin" };

const statusLabels: Record<OrderStatus, string> = {
  new: "New",
  prepared: "Prepared",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};
const orderList = "/admin/orders";
const statusHref = (status: OrderStatus) => `${orderList}?status=${status}`;
const salesDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default function AdminHome() {
  return (
    <div className="adm-dashboard">
      <div className="adm-head">
        <div>
          <h1>Dashboard</h1>
          <p className="adm-sub">Overview of catalog, fulfillment workflow, and recent customer activity.</p>
        </div>
      </div>
      <Suspense fallback={<p className="adm-card adm-sub" role="status">Loading dashboard…</p>}>
        <DashboardData />
      </Suspense>
      <Suspense fallback={<p className="adm-card adm-sub" role="status">جاري تحميل المساحة…</p>}>
        <StorageSection />
      </Suspense>
    </div>
  );
}

/** Storage: usage against the free-plan limits + cleaning old order files. Numbers are read on the server. */
async function StorageSection() {
  await requireAdmin();
  await connection();
  const usage = await readStorageUsage();
  return (
    <section className="adm-storage-grid" aria-label="التخزين">
      <StorageUsageCard usage={usage} />
      <CleanupCard />
    </section>
  );
}

async function DashboardData() {
  const { supabase } = await requireAdmin();
  await connection();
  const today = adminDateKey(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const [statusResults, recent, shipping, sales] = await Promise.all([
    Promise.all(ORDER_STATUSES.map((status) => supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", status))),
    supabase.from("orders").select("id, number, customer_name, status, total, created_at, order_items(qty)")
      .order("created_at", { ascending: false })
      .order("number", { ascending: false })
      .limit(5),
    supabase.from("shipping_rates").select("governorate, fee"),
    readDashboardSales(supabase, today),
  ]);

  const counts = new Map(ORDER_STATUSES.map((status, i) => [status, statusResults[i].count]));
  const countsFailed = statusResults.some((result) => result.error || result.count === null);
  const total = countsFailed ? null : statusResults.reduce((sum, result) => sum + (result.count ?? 0), 0);
  const configured = new Set((shipping.data ?? []).filter((rate) => rate.fee !== null).map((rate) => rate.governorate));
  const missingRates = shipping.error ? 0 : governorates.filter((name) => !configured.has(name)).length;
  const monthly = sales ? formatPrice(sales.monthlyCents / 100) : null;
  const stats = [
    { label: "Total Orders", value: total, href: orderList },
    { label: "Pending Orders", value: counts.get("new"), href: statusHref("new"), priority: true },
    { label: "Monthly Revenue", value: monthly, href: `${orderList}?from=${monthStart}&to=${today}`, note: "Excludes cancelled and returned orders" },
    { label: "Returned Orders", value: counts.get("returned"), href: statusHref("returned") },
  ];

  return (
    <div className="adm-dashboard-content">
      {missingRates > 0 && (
        <div className="adm-alert adm-dashboard-shipping" role="status">
          <span>{missingRates} {missingRates === 1 ? "governorate needs" : "governorates need"} a shipping rate.</span>
          <Link href="/admin/shipping" className="adm-alert-link">Configure Shipping</Link>
        </div>
      )}
      {(countsFailed || recent.error || shipping.error || !sales) && (
        <div className="adm-alert adm-dashboard-shipping" role="alert">
          Some dashboard data could not be loaded. Refresh this page to try again.
        </div>
      )}

      <section className="adm-stats" aria-label="Order statistics">
        {stats.map((stat) => (
          <Link className={`adm-stat${stat.priority ? " adm-stat-pending" : ""}`} key={stat.label} href={stat.href}>
            <span className="stat-label">{stat.label}</span>
            <b className="stat-value" dir="auto">{stat.value ?? "—"}</b>
            {stat.note && <span className="stat-sub">{stat.note}</span>}
          </Link>
        ))}
      </section>

      <section className="adm-card adm-dashboard-panel" aria-labelledby="dashboard-status">
        <h2 id="dashboard-status">Order Status Overview</h2>
        <ul className="adm-dashboard-statuses">
          {ORDER_STATUSES.map((status) => (
            <li key={status}>
              <Link href={statusHref(status)}>
                <span className="adm-badge" data-s={status}>{statusLabels[status]}</span>
                <strong>{counts.get(status) ?? "—"}</strong>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="adm-card adm-dashboard-panel" aria-labelledby="dashboard-sales">
        <h2 id="dashboard-sales">Sales Overview</h2>
        <p className="adm-sub">Last 7 days · Order totals excluding cancelled and returned orders</p>
        {!sales ? <p className="adm-dashboard-empty">Sales data could not be loaded.</p>
          : sales.days.some((day) => day.count > 0) ? <SalesChart days={sales.days} />
          : <p className="adm-dashboard-empty">No sales in the last 7 days.</p>}
      </section>

      <section className="adm-orders-section" aria-labelledby="dashboard-latest">
        <div className="adm-section-title">
          <h2 id="dashboard-latest">Latest Orders</h2>
        </div>
        <div className="adm-table-wrap adm-dashboard-table" role="region" aria-labelledby="dashboard-latest" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Order ID</th>
                <th scope="col">Customer Name</th>
                <th scope="col">Date</th>
                <th scope="col">Items</th>
                <th scope="col">Total</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {(recent.data ?? []).map((order) => {
                const href = `${orderList}/${order.id}`;
                const items = (order.order_items ?? []).reduce((sum, item) => sum + item.qty, 0);
                return (
                  <tr key={order.id}>
                    <td><Link href={href} className="adm-order-link"><bdi dir="ltr">#{order.number}</bdi></Link></td>
                    <td className="adm-customer-cell" dir="auto">{order.customer_name}</td>
                    <td className="adm-date-cell"><time dateTime={order.created_at}>{formatDay(order.created_at)}</time></td>
                    <td className="adm-items-cell">{items}</td>
                    <td className="adm-total-cell">{formatPrice(Number(order.total))}</td>
                    <td><span className="adm-badge" data-s={order.status}>{isOrderStatus(order.status) ? statusLabels[order.status] : order.status}</span></td>
                    <td><Link href={href} className="adm-btn ghost sm" aria-label={`View Details for order #${order.number}`}>View Details</Link></td>
                  </tr>
                );
              })}
              {!recent.data?.length && (
                <tr><td colSpan={7} className="adm-sub">{recent.error ? "Orders could not be loaded." : "No orders yet."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="adm-card adm-dashboard-panel" aria-labelledby="dashboard-actions">
        <h2 id="dashboard-actions">Quick Actions</h2>
        <div className="adm-dashboard-actions">
          <Link className="adm-btn" href="/admin/products/new">Add Product</Link>
          <Link className="adm-btn ghost" href="/admin/categories/new">Add Category</Link>
          <Link className="adm-btn ghost" href={orderList}>View All Orders</Link>
        </div>
      </section>
    </div>
  );
}

function SalesChart({ days }: { days: { date: string; cents: number }[] }) {
  const max = Math.max(1, ...days.map((day) => day.cents));
  return (
    <ol className="adm-sales-chart" aria-label="Daily revenue in Egyptian pounds">
      {days.map((day) => (
        <li key={day.date}>
          <time dateTime={day.date}>{salesDate.format(new Date(`${day.date}T00:00:00Z`))}</time>
          <span className="adm-sales-track" aria-hidden="true">
            <span style={{ inlineSize: `${day.cents / max * 100}%` }} />
          </span>
          <bdi>{formatPrice(day.cents / 100)}</bdi>
        </li>
      ))}
    </ol>
  );
}
