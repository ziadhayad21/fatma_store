"use server";

import {
  DESIGN_EXT,
  DESIGN_MAX_BYTES,
  DESIGN_TYPES,
  isDesignPath,
  validateDesignFile,
} from "@/lib/personalization";
import { allow, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { backendConfigured, createServiceClient } from "@/lib/supabase/admin";

const BUCKET = "designs";

export type UploadTicket =
  | { ok: true; path: string; uploadUrl: string }
  | { ok: false; error: string };

/**
 * Step 1 of an upload: validate the file's declared type/size and hand the browser a single-use
 * signed upload URL for the PRIVATE `designs` bucket. The bucket itself also enforces the
 * 10 MB / mime-type limits, so a lying client is still rejected by Storage.
 */
export async function requestDesignUpload(input: { type: string; size: number }): Promise<UploadTicket> {
  const check = validateDesignFile({ type: String(input?.type), size: Number(input?.size) });
  if (!check.ok) return check;
  if (!backendConfigured()) return { ok: false, error: "رفع التصاميم مش متاح دلوقتي." };
  if (!(await allow("upload"))) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const path = `uploads/${month}/${crypto.randomUUID()}.${DESIGN_EXT[input.type]}`;

  const { data, error } = await createServiceClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("createSignedUploadUrl failed", error?.message);
    return { ok: false, error: "الرفع فشل. جرّب تاني." };
  }
  return { ok: true, path, uploadUrl: data.signedUrl };
}

/** Step 3: make sure the object really landed in the bucket and is what we allow. */
export async function confirmDesignUpload(path: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDesignPath(path)) return { ok: false, error: "ملف غير صالح." };
  const storage = createServiceClient().storage.from(BUCKET);
  const slash = path.lastIndexOf("/");
  const { data, error } = await storage.list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 5 });
  const obj = data?.find((o) => o.name === path.slice(slash + 1));
  if (error || !obj) return { ok: false, error: "الرفع فشل. جرّب تاني." };

  const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string };
  const okType = (DESIGN_TYPES as readonly string[]).includes(String(meta.mimetype));
  if (!okType || !meta.size || meta.size > DESIGN_MAX_BYTES) {
    await storage.remove([path]);
    return { ok: false, error: "الملف لازم يكون صورة PNG أو JPG أو WEBP، وحجمه أقل من 10 ميجا." };
  }
  return { ok: true };
}

/** Delete an upload the customer removed/replaced — but never one that belongs to an order. */
export async function removeDesignUpload(path: string): Promise<void> {
  if (!isDesignPath(path) || !backendConfigured()) return;
  const sb = createServiceClient();
  const { count } = await sb.from("order_items").select("id", { count: "exact", head: true }).eq("design_path", path);
  if (count) return;
  await sb.storage.from(BUCKET).remove([path]);
}

/**
 * Short-lived signed URLs so the customer's own thumbnails survive a reload.
 * Capability model: only someone who holds the unguessable path (the uploader) can ask for it;
 * the bucket stays private and the URL expires in an hour.
 */
export async function getDesignPreviewUrls(paths: string[]): Promise<Record<string, string>> {
  const valid = [...new Set((Array.isArray(paths) ? paths : []).filter(isDesignPath))].slice(0, 20);
  if (valid.length === 0 || !backendConfigured()) return {};
  const { data } = await createServiceClient().storage.from(BUCKET).createSignedUrls(valid, 3600);
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl && !row.error) out[row.path] = row.signedUrl;
  return out;
}
