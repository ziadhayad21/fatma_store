"use server";

import { requireAdmin } from "@/lib/admin/auth";
import { PRODUCT_IMAGE_MAX } from "@/lib/admin/validate";

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export type ImageTicket = { ok: true; uploadUrl: string; publicUrl: string } | { ok: false; error: string };

/** Admin only: signed upload URL for the PUBLIC product-images bucket (storage policy also requires is_admin()). */
export async function requestProductImageUpload(input: { type: string; size: number }): Promise<ImageTicket> {
  const { supabase } = await requireAdmin();
  const ext = TYPES[String(input?.type)];
  if (!ext) return { ok: false, error: "الصورة لازم تكون PNG أو JPG أو WEBP." };
  const size = Number(input?.size);
  if (!(size > 0) || size > PRODUCT_IMAGE_MAX) return { ok: false, error: "حجم الصورة أكبر من 5 ميجا." };

  const path = `products/${crypto.randomUUID()}.${ext}`;
  const bucket = supabase.storage.from("product-images");
  const { data, error } = await bucket.createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "تعذّر تجهيز الرفع." };
  return { ok: true, uploadUrl: data.signedUrl, publicUrl: bucket.getPublicUrl(path).data.publicUrl };
}
