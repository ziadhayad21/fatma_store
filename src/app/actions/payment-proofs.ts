"use server";

import { DESIGN_EXT, validateDesignFile } from "@/lib/personalization";
import { isProofPath, PROOF_BUCKET } from "@/lib/product-rules";
import { allow, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { backendConfigured, createServiceClient } from "@/lib/supabase/admin";
import type { UploadTicket } from "./uploads";

/** Proofs are compressed in the browser (WebP, max 1280px); the server still caps the stored file at 5 MB. */
const PROOF_MAX_BYTES = 5 * 1024 * 1024;
const PROOF_TOO_BIG = "صورة إثبات التحويل أكبر من 5 ميجا.";

export async function requestPaymentProofUpload(input: { type: string; size: number }): Promise<UploadTicket> {
  const check = validateDesignFile({ type: String(input?.type), size: Number(input?.size) });
  if (!check.ok) return check;
  if (Number(input.size) > PROOF_MAX_BYTES) return { ok: false, error: PROOF_TOO_BIG };
  if (!Number.isFinite(input.size) || !backendConfigured()) return { ok: false, error: "رفع إثبات التحويل غير متاح حاليًا." };
  if (!(await allow("upload"))) return { ok: false, error: RATE_LIMITED_MESSAGE };
  const month = new Date().toISOString().slice(0, 7);
  const path = `proofs/${month}/${crypto.randomUUID()}.${DESIGN_EXT[input.type]}`;
  const { data, error } = await createServiceClient().storage.from(PROOF_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("deposit upload ticket", error?.message);
    return { ok: false, error: "تعذّر بدء رفع إثبات التحويل. جرّب تاني." };
  }
  return { ok: true, path, uploadUrl: data.signedUrl };
}

/** Verify the stored bytes, not merely the filename or client-declared MIME type. */
export async function confirmPaymentProofUpload(path: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isProofPath(path) || !backendConfigured()) return { ok: false, error: "إثبات تحويل غير صالح." };
  const { data, error } = await createServiceClient().storage.from(PROOF_BUCKET).download(path);
  if (error || !data) return { ok: false, error: "إثبات التحويل مش موجود. ارفعه تاني." };
  const check = validateDesignFile({ type: data.type, size: data.size });
  if (!check.ok) return check;
  if (data.size > PROOF_MAX_BYTES) return { ok: false, error: PROOF_TOO_BIG };
  const bytes = new Uint8Array(await data.slice(0, 12).arrayBuffer());
  const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!((png && data.type === "image/png") || (jpg && data.type === "image/jpeg") || (webp && data.type === "image/webp"))) {
    return { ok: false, error: "ارفع صورة PNG أو JPG أو WEBP صالحة لإثبات التحويل." };
  }
  return { ok: true };
}
