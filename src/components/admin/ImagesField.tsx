"use client";

import { useRef, useState } from "react";
import type { ProductImage } from "@/lib/types";
import { IMAGE_ACCEPT, ImageUploadError, MIN_IMAGE_SIDE, POSITIONS, uploadProductImage } from "./image-upload";

type Props = {
  /** name of the hidden input that carries the JSON array */
  name: string;
  initial: ProductImage[];
  max: number;
  onUploadingChange?: (uploading: boolean) => void;
};

/** Upload (public bucket), reorder, caption and remove images. Submits as a JSON hidden input. (Category image.) */
export function ImagesField({ name, initial, max, onUploadingChange }: Props) {
  const [images, setImages] = useState<ProductImage[]>(initial);
  const [busy, setBusy] = useState<{ name: string; pct: number } | null>(null);
  const [error, setError] = useState("");
  // natural size of images already saved, to flag ones that are too small to show well
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0 || busy) return;
    setError("");
    for (const file of Array.from(files)) {
      if (images.length >= max) {
        setError(`الحد الأقصى ${max} صور.`);
        break;
      }
      setBusy({ name: file.name, pct: 0 });
      onUploadingChange?.(true);
      try {
        const img = await uploadProductImage(file, (pct) => setBusy({ name: file.name, pct }));
        setImages((list) => [...list, img]);
      } catch (e) {
        setError(e instanceof ImageUploadError || (e instanceof Error && e.message) ? (e as Error).message : "الرفع فشل.");
      }
    }
    setBusy(null);
    onUploadingChange?.(false);
    if (input.current) input.current.value = "";
  }

  const patch = (i: number, p: Partial<ProductImage>) => setImages((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) =>
    setImages((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  return (
    <div className="adm-imgs">
      <input type="hidden" name={name} value={JSON.stringify(images)} />
      {images.map((img, i) => (
        <div className="adm-img" key={img.src}>
          {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of arbitrary public URLs */}
          <img
            src={img.src}
            alt=""
            style={{ objectPosition: img.position }}
            onLoad={(e) => {
              const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
              setSizes((m) => (m[img.src]?.width === width ? m : { ...m, [img.src]: { width, height } }));
            }}
          />
          <div className="fields">
            <input type="text" value={img.alt} onChange={(e) => patch(i, { alt: e.target.value })} placeholder="وصف الصورة (للقراء الصوتيين)" aria-label={`وصف الصورة ${i + 1}`} maxLength={200} />
            <input type="text" list="img-pos" value={img.position} onChange={(e) => patch(i, { position: e.target.value })} aria-label={`موضع الصورة ${i + 1}`} dir="ltr" />
            <span className="adm-hint" dir="ltr">{img.src.replace(/^https?:\/\/[^/]+/, "")}{i === 0 ? "  — الصورة الرئيسية" : ""}</span>
            {sizes[img.src] && Math.min(sizes[img.src].width, sizes[img.src].height) < MIN_IMAGE_SIDE && (
              <span className="adm-err" role="alert">
                الصورة دي صغيرة جدًا ({sizes[img.src].width}×{sizes[img.src].height} بكسل) وبتظهر على الموقع كمربع مغبّش. شيلها وارفع الصورة الأصلية.
              </span>
            )}
          </div>
          <div className="ctl">
            <button type="button" className="adm-btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="قدّم">↑</button>
            <button type="button" className="adm-btn ghost sm" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label="أخّر">↓</button>
            <button type="button" className="adm-btn ghost sm" onClick={() => setImages((l) => l.filter((_, k) => k !== i))}>شيل</button>
          </div>
        </div>
      ))}
      <datalist id="img-pos">{POSITIONS.map((p) => <option key={p.value} value={p.value} />)}</datalist>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", position: "relative" }}>
        <input ref={input} id={`${name}-file`} type="file" accept={IMAGE_ACCEPT} multiple={max > 1} className="vh" disabled={busy !== null} onChange={(e) => void upload(e.target.files)} />
        <label htmlFor={`${name}-file`} className="adm-btn ghost" style={{ cursor: "pointer" }} aria-disabled={images.length >= max}>
          + {max > 1 ? "إضافة صور" : "رفع صورة"}
        </label>
        <span className="adm-hint">PNG / JPG / WEBP حتى 5 ميجا. تتخزن في Supabase Storage.</span>
      </div>
      {busy && (
        <div role="status">
          <span className="adm-hint">بيترفع {busy.name}… {busy.pct}%</span>
          <div className="adm-bar"><i style={{ width: `${busy.pct}%` }} /></div>
        </div>
      )}
      {error && <span className="adm-err" role="alert">{error}</span>}
    </div>
  );
}
