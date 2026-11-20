/**
 * Image compression rules per upload type, and the encoder shared by the Web Worker and the main-thread
 * fallback. No DOM types beyond what both a worker (OffscreenCanvas) and a page (canvas) provide.
 */
export type UploadKind = "design" | "proof" | "product";

export type EncodeTarget = { type: "image/webp" | "image/jpeg" | "image/png"; quality?: number };

export type CompressionPlan =
  /** upload the original bytes untouched */
  | { action: "keep" }
  | {
      action: "encode";
      width: number;
      height: number;
      /** tried in order; a target the browser cannot encode (e.g. WebP on an old Safari) falls through */
      targets: EncodeTarget[];
      /** keep lowering the quality (lossy targets only) until the file is under this size */
      targetBytes?: number;
      retryQualities?: number[];
      /** use the original instead when re-encoding made it bigger and no resize was needed */
      keepSmallerOriginal: boolean;
    };

export const RULES = {
  /** printed: never lossy-converted; only very large images are scaled down, in their own format */
  design: { maxSide: 4000 },
  /** deposit transfer screenshots/photos: small WebP (JPEG fallback), aim under ~200 KB */
  proof: { maxSide: 1280, quality: 0.7, targetBytes: 200 * 1024, retryQualities: [0.55, 0.4] },
  /** shop photos: up to 2000px, WebP 0.82 (JPEG 0.85 fallback) */
  product: { maxSide: 2000, quality: 0.82, jpegQuality: 0.85 },
} as const;

/** Fit inside maxSide on the long side, keeping the aspect ratio (never upscales). */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number; resized: boolean } {
  const long = Math.max(width, height);
  if (long <= maxSide) return { width, height, resized: false };
  const k = maxSide / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), resized: true };
}

export function compressionPlan(kind: UploadKind, img: { width: number; height: number; type: string }): CompressionPlan {
  if (kind === "design") {
    const fit = fitWithin(img.width, img.height, RULES.design.maxSide);
    if (!fit.resized) return { action: "keep" };
    // same format as the original: PNG stays lossless PNG (transparency kept); JPEG / WebP at the top quality
    const target: EncodeTarget =
      img.type === "image/png" ? { type: "image/png" } : img.type === "image/webp" ? { type: "image/webp", quality: 1 } : { type: "image/jpeg", quality: 0.95 };
    return { action: "encode", width: fit.width, height: fit.height, targets: [target], keepSmallerOriginal: false };
  }
  if (kind === "proof") {
    const fit = fitWithin(img.width, img.height, RULES.proof.maxSide);
    return {
      action: "encode",
      width: fit.width,
      height: fit.height,
      targets: [{ type: "image/webp", quality: RULES.proof.quality }, { type: "image/jpeg", quality: RULES.proof.quality }],
      targetBytes: RULES.proof.targetBytes,
      retryQualities: [...RULES.proof.retryQualities],
      keepSmallerOriginal: !fit.resized,
    };
  }
  const fit = fitWithin(img.width, img.height, RULES.product.maxSide);
  return {
    action: "encode",
    width: fit.width,
    height: fit.height,
    targets: [{ type: "image/webp", quality: RULES.product.quality }, { type: "image/jpeg", quality: RULES.product.jpegQuality }],
    keepSmallerOriginal: !fit.resized,
  };
}

/** Anything with a 2D context we can draw on and turn into a Blob (OffscreenCanvas or a wrapped <canvas>). */
export type Surface = {
  draw(bitmap: ImageBitmap, width: number, height: number): void;
  toBlob(type: string, quality?: number): Promise<Blob>;
};

/**
 * Runs a plan: draw once, then encode with the first target the browser supports; lossy targets are
 * re-encoded at lower qualities until under targetBytes. Returns null when the original should be kept.
 */
export async function encodeWithPlan(
  source: Blob,
  plan: CompressionPlan,
  makeSurface: (w: number, h: number) => Surface,
): Promise<Blob | null> {
  if (plan.action === "keep") return null;
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const surface = makeSurface(plan.width, plan.height);
    surface.draw(bitmap, plan.width, plan.height);
    for (const target of plan.targets) {
      let out = await surface.toBlob(target.type, target.quality);
      if (out.type !== target.type) continue; // not supported here: try the next format
      if (plan.targetBytes && target.type !== "image/png") {
        for (const q of plan.retryQualities ?? []) {
          if (out.size <= plan.targetBytes) break;
          out = await surface.toBlob(target.type, q);
        }
      }
      if (plan.keepSmallerOriginal && out.size >= source.size) return null;
      return out;
    }
    return null; // nothing encodable: keep the original (still checked by the server)
  } finally {
    bitmap.close();
  }
}

export const EXT: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

/** "photo.JPG" + image/webp -> "photo.webp" */
export function renameForType(name: string, type: string): string {
  const ext = EXT[type];
  if (!ext) return name;
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}.${ext}`;
}

/** 180 KB / 1.4 MB */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
