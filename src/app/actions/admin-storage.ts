"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { CLEANUP_MONTHS, isCleanupMonths } from "@/lib/admin/cleanup";
import { filesStillUsed, removeStoredFiles, type StoredFile } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ItemFiles = { design_path: string | null; pieces: { design_path?: string | null }[] | null };

function filesOf(order: { payment_proof_path: string | null; order_items: ItemFiles[] | null }): StoredFile[] {
  const out: StoredFile[] = [];
  if (order.payment_proof_path) out.push({ bucket: "payment-proofs", path: order.payment_proof_path });
  for (const it of order.order_items ?? []) {
    if (it.design_path) out.push({ bucket: "designs", path: it.design_path });
    for (const p of it.pieces ?? []) if (p?.design_path) out.push({ bucket: "designs", path: p.design_path });
  }
  return out;
}

export type DeleteOrdersResult = { ok: boolean; message: string; deleted: number; filesRemoved: number };

/**
 * Admin only (requireAdmin here + the orders_admin_delete RLS policy). Deletes the orders (their items
 * cascade; linked suggestions keep existing with order_id = null), then their files unless another order
 * still uses the same file. Order numbers are never reused.
 */
export async function deleteOrders(ids: string[]): Promise<DeleteOrdersResult> {
  const { supabase } = await requireAdmin();
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string" && UUID.test(x)))].slice(0, 200);
  if (list.length === 0) return { ok: false, message: "اختار طلب واحد على الأقل.", deleted: 0, filesRemoved: 0 };

  const { data: orders, error: readError } = await supabase
    .from("orders")
    .select("id, payment_proof_path, order_items(design_path, pieces)")
    .in("id", list);
  if (readError) return { ok: false, message: "تعذّر قراءة الطلبات. جرّب تاني.", deleted: 0, filesRemoved: 0 };
  const files = (orders ?? []).flatMap((o) => filesOf(o as { payment_proof_path: string | null; order_items: ItemFiles[] | null }));

  const { data: gone, error } = await supabase.from("orders").delete().in("id", list).select("id");
  if (error) {
    console.error("deleteOrders", error.message);
    return { ok: false, message: "تعذّر حذف الطلبات. جرّب تاني.", deleted: 0, filesRemoved: 0 };
  }
  const deleted = gone?.length ?? 0;

  // the orders are gone now: anything still referenced belongs to another order and stays
  let filesRemoved = 0;
  if (deleted && files.length) {
    const used = await filesStillUsed(files);
    filesRemoved = (await removeStoredFiles(files.filter((f) => !used.has(f.path)))).removed;
  }
  revalidatePath("/admin", "layout");
  return {
    ok: deleted > 0,
    message: deleted ? (deleted === 1 ? "الطلب اتحذف." : `اتحذف ${deleted} طلب.`) : "الطلبات مش موجودة.",
    deleted,
    filesRemoved,
  };
}

export type CleanupPreview = { ok: true; months: number; files: number; bytes: number; orders: number } | { ok: false; message: string };

async function candidates(months: number) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_file_cleanup_candidates", { p_months: months });
  if (error) throw new Error(error.message);
  return { supabase, rows: (data ?? []) as { order_id: string; bucket: StoredFile["bucket"]; path: string; bytes: number | string }[] };
}

/** "هيتمسح X ملف، حوالي Y ميجا": files of delivered / cancelled orders older than `months` (orders kept). */
export async function previewCleanup(months: number): Promise<CleanupPreview> {
  if (!isCleanupMonths(months)) return { ok: false, message: `اختار ${CLEANUP_MONTHS.join(" / ")} شهور.` };
  try {
    const { rows } = await candidates(months);
    return {
      ok: true,
      months,
      files: rows.length,
      bytes: rows.reduce((a, r) => a + Number(r.bytes), 0),
      orders: new Set(rows.map((r) => r.order_id)).size,
    };
  } catch (e) {
    console.error("previewCleanup", e);
    return { ok: false, message: "تعذّر حساب الملفات. جرّب تاني." };
  }
}

export type CleanupResult = { ok: true; files: number; bytes: number; orders: number; failed: number } | { ok: false; message: string };

/** Deletes those files (Storage API) and marks their orders, which are kept with their items. */
export async function runCleanup(months: number): Promise<CleanupResult> {
  if (!isCleanupMonths(months)) return { ok: false, message: `اختار ${CLEANUP_MONTHS.join(" / ")} شهور.` };
  try {
    const { supabase, rows } = await candidates(months);
    if (rows.length === 0) return { ok: true, files: 0, bytes: 0, orders: 0, failed: 0 };
    const { removed, failed } = await removeStoredFiles(rows.map((r) => ({ bucket: r.bucket, path: r.path })));
    const orderIds = [...new Set(rows.map((r) => r.order_id))];
    const { error } = await supabase.from("orders").update({ files_purged_at: new Date().toISOString() }).in("id", orderIds);
    if (error) console.error("runCleanup: mark orders", error.message);
    revalidatePath("/admin", "layout");
    return { ok: true, files: removed, bytes: rows.reduce((a, r) => a + Number(r.bytes), 0), orders: orderIds.length, failed };
  } catch (e) {
    console.error("runCleanup", e);
    return { ok: false, message: "التنظيف ما تمش. جرّب تاني." };
  }
}
