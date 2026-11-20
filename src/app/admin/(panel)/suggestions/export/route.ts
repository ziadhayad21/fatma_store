import { getAdmin } from "@/lib/admin/auth";
import { csvCell } from "@/lib/admin/csv";

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });
  const { data } = await admin.supabase
    .from("suggestions")
    .select("text, created_at, order:orders(number)")
    .order("created_at", { ascending: false });
  const rows = (data ?? []).map((r) => {
    const order = r.order as { number: number } | { number: number }[] | null;
    const number = Array.isArray(order) ? order[0]?.number : order?.number;
    // customer text is untrusted: every cell goes through the formula-injection guard
    return [csvCell(r.text), csvCell(r.created_at), csvCell(number ? `#${number}` : "")].join(",");
  });
  const csv = ["suggestion,created_at,order", ...rows].join("\r\n");
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="suggestions.csv"',
      "Cache-Control": "no-store",
    },
  });
}
