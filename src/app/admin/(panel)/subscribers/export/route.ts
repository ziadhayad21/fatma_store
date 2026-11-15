import { getAdmin } from "@/lib/admin/auth";

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });
  const { data } = await admin.supabase.from("newsletter_subscribers").select("email, created_at").order("created_at", { ascending: false });
  // guard against spreadsheet formula injection in user-supplied emails
  const cell = (v: string) => `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  const csv = ["email,subscribed_at", ...(data ?? []).map((r) => `${cell(r.email)},${cell(r.created_at)}`)].join("\r\n");
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="subscribers.csv"',
      "Cache-Control": "no-store",
    },
  });
}
