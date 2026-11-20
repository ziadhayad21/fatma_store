import { requestProductImageUpload } from "@/app/actions/admin-images";
import { confirmPaymentProofUpload, requestPaymentProofUpload } from "@/app/actions/payment-proofs";
import { confirmDesignUpload, removeDesignUpload, requestDesignUpload } from "@/app/actions/uploads";
import { publicEnv } from "./env";
import { compressImage, type UploadKind } from "./image-compress";
import { DESIGN_EXT } from "./personalization";

/**
 * THE place where the browser stores files. Every upload (customer designs, deposit proofs, product photos)
 * goes through here: compress by type -> ask the server for a signed upload URL -> PUT -> confirm.
 * Moving storage elsewhere (e.g. Cloudflare R2) means changing this module and the server actions it calls.
 */

export type UploadStage = "compress" | "upload";
export type UploadedFile = { path: string; name: string; size: number; originalSize: number };
export type UploadCallbacks = { onProgress: (pct: number) => void; onStage?: (stage: UploadStage) => void };

/** The product page only talks to this interface. */
export interface DesignUploader {
  upload(file: File, onProgress: (pct: number) => void, onStage?: (stage: UploadStage) => void): Promise<UploadedFile>;
  remove(path: string): Promise<void>;
}

export class UploadError extends Error {}

/** PUT the file to the signed URL with XHR so we get real upload progress. */
export function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("apikey", publicEnv.supabasePublishableKey);
    xhr.setRequestHeader("content-type", file.type);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError("الرفع فشل. جرّب تاني.")));
    xhr.onerror = () => reject(new UploadError("الرفع فشل. اتأكد من النت وجرّب تاني."));
    xhr.onabort = () => reject(new UploadError("الرفع اتلغى."));
    xhr.send(file);
  });
}

/** Compress (by kind), reporting the stage; returns the file to send. */
async function prepare(file: File, kind: UploadKind, cb: UploadCallbacks) {
  cb.onStage?.("compress");
  cb.onProgress(0);
  const c = await compressImage(file, kind);
  cb.onStage?.("upload");
  return c;
}

// ---------------------------------------------------------------- customer designs (private bucket)
const supabaseDesignUploader: DesignUploader = {
  async upload(file, onProgress, onStage) {
    const { file: out, originalSize } = await prepare(file, "design", { onProgress, onStage });
    const ticket = await requestDesignUpload({ type: out.type, size: out.size });
    if (!ticket.ok) throw new UploadError(ticket.error);
    await putWithProgress(ticket.uploadUrl, out, onProgress);
    const done = await confirmDesignUpload(ticket.path);
    if (!done.ok) throw new UploadError(done.error);
    onProgress(100);
    return { path: ticket.path, name: file.name, size: out.size, originalSize };
  },
  async remove(path) {
    await removeDesignUpload(path);
  },
};

/** No backend configured (fresh clone): compress for real, simulate the transfer. Never reaches an order. */
const stubDesignUploader: DesignUploader = {
  async upload(file, onProgress, onStage) {
    const { file: out, originalSize } = await prepare(file, "design", { onProgress, onStage });
    for (let p = 0; p <= 100; p += 20) {
      onProgress(p);
      await new Promise((r) => setTimeout(r, 90));
    }
    return { path: `stub/${crypto.randomUUID()}.${DESIGN_EXT[out.type] ?? "bin"}`, name: file.name, size: out.size, originalSize };
  },
  async remove() {},
};

export const designUploader: DesignUploader = publicEnv.supabaseUrl ? supabaseDesignUploader : stubDesignUploader;

// ---------------------------------------------------------------- deposit transfer proofs (private bucket)
export async function uploadPaymentProof(file: File, cb: UploadCallbacks): Promise<UploadedFile> {
  const { file: out, originalSize } = await prepare(file, "proof", cb);
  const ticket = await requestPaymentProofUpload({ type: out.type, size: out.size });
  if (!ticket.ok) throw new UploadError(ticket.error);
  await putWithProgress(ticket.uploadUrl, out, cb.onProgress);
  const done = await confirmPaymentProofUpload(ticket.path);
  if (!done.ok) throw new UploadError(done.error);
  cb.onProgress(100);
  return { path: ticket.path, name: out.name, size: out.size, originalSize };
}

// ---------------------------------------------------------------- product photos (public bucket, admin only)
export async function uploadProductPhoto(file: File, cb: UploadCallbacks): Promise<UploadedFile & { publicUrl: string }> {
  const { file: out, originalSize } = await prepare(file, "product", cb);
  const ticket = await requestProductImageUpload({ type: out.type, size: out.size });
  if (!ticket.ok) throw new UploadError(ticket.error);
  await putWithProgress(ticket.uploadUrl, out, cb.onProgress);
  cb.onProgress(100);
  return { path: ticket.publicUrl, name: out.name, size: out.size, originalSize, publicUrl: ticket.publicUrl };
}
