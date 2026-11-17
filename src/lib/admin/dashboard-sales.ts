import type { SupabaseClient } from "@supabase/supabase-js";
import { adminDateKey, orderDateBoundary } from "./format";

const BATCH_SIZE = 500;

function previousCalendarDay(day: string, daysBack: number): string {
  const utcDate = new Date(`${day}T00:00:00Z`);
  utcDate.setUTCDate(utcDate.getUTCDate() - daysBack);
  return utcDate.toISOString().slice(0, 10);
}

export async function readDashboardSales(supabase: SupabaseClient, today: string) {
  const monthStart = `${today.slice(0, 7)}-01`;
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: previousCalendarDay(today, 6 - i),
    cents: 0,
    count: 0,
  }));
  const byDay = new Map(days.map((day) => [day.date, day]));
  const start = orderDateBoundary(days[0].date < monthStart ? days[0].date : monthStart)!;
  const end = orderDateBoundary(today, true)!;
  let monthlyCents = 0;
  let afterNumber: number | undefined;

  // The hosted API has aggregates disabled. Read only qualifying rows and
  // paginate by the unique order number so totals are not capped by the API.
  for (;;) {
    let query = supabase.from("orders")
      .select("number, total, created_at")
      .gte("created_at", start)
      .lt("created_at", end)
      .not("status", "in", "(cancelled,returned)")
      .order("number")
      .limit(BATCH_SIZE);
    if (afterNumber !== undefined) query = query.gt("number", afterNumber);
    const { data, error } = await query;
    if (error) return null;

    for (const order of data) {
      const date = adminDateKey(new Date(order.created_at));
      const cents = Math.round(Number(order.total) * 100);
      if (date >= monthStart) monthlyCents += cents;
      const day = byDay.get(date);
      if (day) {
        day.cents += cents;
        day.count++;
      }
    }
    if (data.length < BATCH_SIZE) break;
    afterNumber = data[data.length - 1].number;
  }

  return { monthlyCents, days };
}
