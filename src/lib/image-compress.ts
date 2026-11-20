import { compressionPlan, encodeWithPlan, renameForType, type CompressionPlan, type UploadKind } from "./image-compress-core";

export { formatBytes, type UploadKind } from "./image-compress-core";

export type Compressed = { file: File; originalSize: number; width: number; height: number; changed: boolean };

async function dimensions(file: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

// ---------------------------------------------------------------- the worker (one per page, created lazily)
let worker: Worker | null | undefined;
let seq = 0;
const pending = new Map<number, { resolve: (b: Blob | null) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return (worker = null);
    worker = new Worker(new URL("./image-compress.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; blob?: Blob | null; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.blob ?? null);
    };
    worker.onerror = () => {
      for (const p of pending.values()) p.reject(new Error("worker failed"));
      pending.clear();
      worker = null; // fall back to the main thread from now on
    };
  } catch {
    worker = null;
  }
  return worker;
}

function inWorker(w: Worker, file: Blob, plan: CompressionPlan): Promise<Blob | null> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, file, plan });
  });
}

/** Main-thread fallback (old browsers without OffscreenCanvas in workers). */
function onMainThread(file: Blob, plan: CompressionPlan): Promise<Blob | null> {
  return encodeWithPlan(file, plan, (w, h) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    return {
      draw(bitmap, width, height) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bitmap, 0, 0, width, height);
      },
      toBlob: (type, quality) =>
        new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), type, quality)),
    };
  });
}

/**
 * Prepares one image for upload according to its type (see RULES in image-compress-core):
 * designs keep their format and quality (only > 4000px is scaled down), proofs and product photos
 * become small WebP. Any failure returns the original file (the server still checks type and size).
 */
export async function compressImage(file: File, kind: UploadKind): Promise<Compressed> {
  const keep = (w = 0, h = 0): Compressed => ({ file, originalSize: file.size, width: w, height: h, changed: false });
  let dims: { width: number; height: number };
  try {
    dims = await dimensions(file);
  } catch {
    return keep();
  }
  const plan = compressionPlan(kind, { ...dims, type: file.type });
  if (plan.action === "keep") return keep(dims.width, dims.height);
  let blob: Blob | null = null;
  try {
    const w = getWorker();
    blob = w ? await inWorker(w, file, plan).catch(() => onMainThread(file, plan)) : await onMainThread(file, plan);
  } catch {
    blob = null;
  }
  if (!blob) return keep(dims.width, dims.height);
  return {
    file: new File([blob], renameForType(file.name, blob.type), { type: blob.type, lastModified: Date.now() }),
    originalSize: file.size,
    width: plan.width,
    height: plan.height,
    changed: true,
  };
}
