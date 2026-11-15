import { NextResponse } from "next/server";
import { backendConfigured, createServiceClient } from "@/lib/supabase/admin";

/**
 * Daily housekeeping, called by Vercel Cron (see vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 *  1. Removes customer uploads older than 24h that no order references (abandoned carts, replaced files).
 *  2. Prunes old rate-limit counters.
 * Nothing attached to an order is ever deleted.
 */
const BUCKET = "designs";
const MIN_AGE_MS = 24 * 3600 * 1000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!backendConfigured()) return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });

  const sb = createServiceClient();
  const storage = sb.storage.from(BUCKET);
  const cutoff = Date.now() - MIN_AGE_MS;

  // uploads/<yyyy-mm>/<uuid>.<ext>
  const old: string[] = [];
  const { data: months } = await storage.list("uploads", { limit: 1000 });
  for (const m of months ?? []) {
    if (m.id) continue; // a file directly under uploads/ (shouldn't exist); folders have no id
    const { data: files } = await storage.list(`uploads/${m.name}`, { limit: 1000 });
    for (const f of files ?? []) {
      const created = f.created_at ? Date.parse(f.created_at) : NaN;
      if (Number.isFinite(created) && created < cutoff) old.push(`uploads/${m.name}/${f.name}`);
    }
  }

  let removed = 0;
  for (let i = 0; i < old.length; i += 100) {
    const batch = old.slice(i, i + 100);
    const { data: used, error } = await sb.from("order_items").select("design_path").in("design_path", batch);
    if (error) return NextResponse.json({ ok: false, error: "lookup failed" }, { status: 500 });
    const keep = new Set((used ?? []).map((r) => r.design_path as string));
    const doomed = batch.filter((p) => !keep.has(p));
    if (doomed.length) {
      const { error: rmErr } = await storage.remove(doomed);
      if (!rmErr) removed += doomed.length;
    }
  }

  await sb.from("rate_limits").delete().lt("window_start", new Date(Date.now() - 24 * 3600 * 1000).toISOString());

  return NextResponse.json({ ok: true, scanned: old.length, removed });
}
