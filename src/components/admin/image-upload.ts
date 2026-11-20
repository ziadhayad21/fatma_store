import { validateImageBeforeCompression } from "@/lib/personalization";
import type { ProductImage } from "@/lib/types";
import { uploadProductPhoto, type UploadStage } from "@/lib/upload";

/** Photos fill a ~600px-wide frame on the product page; anything smaller looks blurred. */
export const MIN_IMAGE_SIDE = 500;
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
/** focal positions offered in the admin (CSS object-position) */
export const POSITIONS: { value: string; label: string }[] = [
  { value: "center", label: "الوسط" },
  { value: "top", label: "فوق" },
  { value: "center 20%", label: "فوق شوية (20%)" },
  { value: "center 30%", label: "30%" },
  { value: "center 40%", label: "40%" },
  { value: "center 50%", label: "50%" },
  { value: "center 60%", label: "60%" },
  { value: "bottom", label: "تحت" },
];

export class ImageUploadError extends Error {}

async function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

export type UploadedPhoto = { image: ProductImage; name: string; size: number; originalSize: number };

/**
 * Checks one file (type, dimensions), then compresses (WebP, max 2000px) and uploads it through lib/upload.
 * The server caps the stored file at 5 MB. Throws ImageUploadError.
 */
export async function uploadProductImage(file: File, onProgress: (pct: number) => void, onStage?: (s: UploadStage) => void): Promise<UploadedPhoto> {
  const pre = validateImageBeforeCompression(file);
  if (!pre.ok) throw new ImageUploadError(pre.error);
  const dims = await imageSize(file);
  if (!dims) throw new ImageUploadError(`تعذّر قراءة الصورة ${file.name}. جرّب تصدّرها تاني.`);
  if (Math.min(dims.width, dims.height) < MIN_IMAGE_SIDE) {
    throw new ImageUploadError(`الصورة ${file.name} صغيرة جدًا (${dims.width}×${dims.height} بكسل) وهتظهر مغبّشة. ارفع صورة أقل ضلع فيها ${MIN_IMAGE_SIDE} بكسل على الأقل.`);
  }
  try {
    const res = await uploadProductPhoto(file, { onProgress, onStage });
    return { image: { src: res.publicUrl, alt: "", position: "center" }, name: file.name, size: res.size, originalSize: res.originalSize };
  } catch (e) {
    throw new ImageUploadError(e instanceof Error && e.message ? e.message : "الرفع فشل.");
  }
}
