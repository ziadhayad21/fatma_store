import { requestProductImageUpload } from "@/app/actions/admin-images";
import { PRODUCT_IMAGE_MAX } from "@/lib/admin/validate";
import type { ProductImage } from "@/lib/types";
import { putWithProgress } from "@/lib/upload";

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

/** Checks one file (type, size, dimensions) and uploads it to the public bucket. Throws ImageUploadError. */
export async function uploadProductImage(file: File, onProgress: (pct: number) => void): Promise<ProductImage> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new ImageUploadError("الصورة لازم تكون PNG أو JPG أو WEBP.");
  if (file.size > PRODUCT_IMAGE_MAX) throw new ImageUploadError("حجم الصورة أكبر من 5 ميجا.");
  const dims = await imageSize(file);
  if (!dims) throw new ImageUploadError(`تعذّر قراءة الصورة ${file.name}. جرّب تصدّرها تاني.`);
  if (Math.min(dims.width, dims.height) < MIN_IMAGE_SIDE) {
    throw new ImageUploadError(`الصورة ${file.name} صغيرة جدًا (${dims.width}×${dims.height} بكسل) وهتظهر مغبّشة. ارفع صورة أقل ضلع فيها ${MIN_IMAGE_SIDE} بكسل على الأقل.`);
  }
  const t = await requestProductImageUpload({ type: file.type, size: file.size });
  if (!t.ok) throw new ImageUploadError(t.error);
  await putWithProgress(t.uploadUrl, file, onProgress);
  return { src: t.publicUrl, alt: "", position: "center" };
}
