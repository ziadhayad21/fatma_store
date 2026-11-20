import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Server-side storage housekeeping (deleting files, reading usage). Browser uploads live in lib/upload.ts;
 * together these two modules are what changes if files move to another provider (e.g. Cloudflare R2).
 * Callers must have checked the admin first.
 */
export type StoredFile = { bucket: "designs" | "payment-proofs"; path: string };

/** Free-plan limits shown on the dashboard. */
export const PLAN_LIMITS = { dbBytes: 500 * 1024 * 1024, storageBytes: 1024 * 1024 * 1024 };

/** Deletes files through the Storage API (so the bytes are really gone, not just the table row). */
export async function removeStoredFiles(files: StoredFile[]): Promise<{ removed: number; failed: number }> {
  const storage = createServiceClient().storage;
  let removed = 0;
  let failed = 0;
  for (const bucket of ["designs", "payment-proofs"] as const) {
    const paths = [...new Set(files.filter((f) => f.bucket === bucket).map((f) => f.path))];
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100);
      const { data, error } = await storage.from(bucket).remove(batch);
      if (error) {
        console.error("removeStoredFiles", bucket, error.message);
        failed += batch.length;
      } else removed += data?.length ?? 0;
    }
  }
  return { removed, failed };
}

/**
 * Which of these files is still referenced by an order (designs: item or couples piece; proofs: an order).
 * Any lookup error answers "all of them" so nothing is deleted by mistake.
 */
export async function filesStillUsed(files: StoredFile[]): Promise<Set<string>> {
  const sb = createServiceClient();
  const designs = [...new Set(files.filter((f) => f.bucket === "designs").map((f) => f.path))];
  const proofs = [...new Set(files.filter((f) => f.bucket === "payment-proofs").map((f) => f.path))];
  const used = new Set<string>();
  if (designs.length) {
    const { data, error } = await sb.rpc("design_paths_in_use", { p_paths: designs });
    if (error) designs.forEach((p) => used.add(p));
    else for (const r of (data as unknown[] | null) ?? []) used.add(typeof r === "string" ? r : String(Object.values(r as object)[0]));
  }
  if (proofs.length) {
    const { data, error } = await sb.from("orders").select("payment_proof_path").in("payment_proof_path", proofs);
    if (error) proofs.forEach((p) => used.add(p));
    else for (const r of data ?? []) used.add(r.payment_proof_path as string);
  }
  return used;
}

export type StorageUsage = { dbBytes: number; storageBytes: number; buckets: Record<string, number> };

/** Database size and stored bytes (server only: the SQL function is granted to the service role alone). */
export async function readStorageUsage(): Promise<StorageUsage | null> {
  const { data, error } = await createServiceClient().rpc("admin_storage_usage");
  if (error || !data) {
    if (error) console.error("admin_storage_usage", error.message);
    return null;
  }
  const u = data as { db_bytes: number | string; storage_bytes: number | string; buckets: Record<string, number | string> | null };
  return {
    dbBytes: Number(u.db_bytes),
    storageBytes: Number(u.storage_bytes),
    buckets: Object.fromEntries(Object.entries(u.buckets ?? {}).map(([k, v]) => [k, Number(v)])),
  };
}
