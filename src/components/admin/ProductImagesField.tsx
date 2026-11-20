"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { formatBytes } from "@/lib/image-compress";
import type { ProductImage } from "@/lib/types";
import { IMAGE_ACCEPT, ImageUploadError, MIN_IMAGE_SIDE, POSITIONS, uploadProductImage } from "./image-upload";

type Props = {
  /** name of the hidden input that carries the JSON array */
  name: string;
  initial: ProductImage[];
  max: number;
  onUploadingChange?: (uploading: boolean) => void;
  /** every change (upload, reorder, settings, remove) — for the live preview and the unsaved-changes bar */
  onChange?: (images: ProductImage[]) => void;
};

/**
 * Product photos: drop zone + thumbnail grid. Drag a thumbnail to reorder (or use قدّم / أخّر in its
 * settings); the first is the main photo, the second shows on hover. Alt text and focal position live
 * in a small per-image "إعدادات" popover. Submits as a JSON hidden input (same shape as before).
 */
export function ProductImagesField({ name, initial, max, onUploadingChange, onChange }: Props) {
  const [images, setImagesState] = useState<ProductImage[]>(initial);
  const current = useRef(initial); // the latest list, also between renders during a multi-file upload
  const [busy, setBusy] = useState<{ name: string; pct: number; stage?: "compress" | "upload" } | null>(null);
  // the last uploaded files with their stored size (after compression)
  const [uploaded, setUploaded] = useState<{ name: string; size: number; originalSize: number }[]>([]);
  const [error, setError] = useState("");
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [dropOver, setDropOver] = useState(false);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const uid = useId();

  const setImages = (fn: (l: ProductImage[]) => ProductImage[]) => {
    const v = fn(current.current);
    if (v === current.current) return;
    current.current = v;
    setImagesState(v);
    onChange?.(v);
  };

  // close the settings popover on Escape / outside click
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.(`[data-pop="${uid}-${open}"]`)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, uid]);

  async function upload(files: FileList | File[] | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0 || busy) return;
    setError("");
    let count = current.current.length;
    onUploadingChange?.(true);
    for (const file of list) {
      if (count >= max) {
        setError(`الحد الأقصى ${max} صور.`);
        break;
      }
      setBusy({ name: file.name, pct: 0 });
      try {
        const res = await uploadProductImage(
          file,
          (pct) => setBusy((b) => ({ name: file.name, pct, stage: b?.stage })),
          (stage) => setBusy((b) => ({ name: file.name, pct: b?.pct ?? 0, stage })),
        );
        const img = res.image;
        setUploaded((u) => [...u, { name: res.name, size: res.size, originalSize: res.originalSize }].slice(-8));
        setImages((l) => [...l, img]);
        count++;
      } catch (e) {
        setError(e instanceof ImageUploadError || (e instanceof Error && e.message) ? (e as Error).message : "الرفع فشل.");
      }
    }
    setBusy(null);
    onUploadingChange?.(false);
    if (input.current) input.current.value = "";
  }

  const patch = (i: number, p: Partial<ProductImage>) => setImages((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const moveTo = (from: number, to: number) =>
    setImages((l) => {
      if (from === to || to < 0 || to >= l.length) return l;
      const c = [...l];
      const [x] = c.splice(from, 1);
      c.splice(to, 0, x);
      return c;
    });
  const remove = (i: number) => {
    setOpen(null);
    setImages((l) => l.filter((_, k) => k !== i));
  };
  const full = images.length >= max;

  return (
    <div className="adm-pimgs">
      <input type="hidden" name={name} value={JSON.stringify(images)} />
      <input
        ref={input}
        id={`${uid}-file`}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="vh"
        disabled={busy !== null || full}
        onChange={(e) => void upload(e.target.files)}
      />

      {images.length > 0 && (
        <ul className="adm-pimgs-grid" aria-label="صور المنتج (اسحب صورة لتغيير الترتيب)">
          {images.map((img, i) => {
            const small = sizes[img.src] && Math.min(sizes[img.src].width, sizes[img.src].height) < MIN_IMAGE_SIDE;
            return (
              <li
                key={img.src}
                className="adm-pimg"
                draggable
                data-dragging={drag?.from === i || undefined}
                data-over={drag && drag.over === i && drag.from !== i ? "" : undefined}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(i));
                  setDrag({ from: i, over: i });
                }}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  if (drag.over !== i) setDrag({ ...drag, over: i });
                }}
                onDrop={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  moveTo(drag.from, i);
                  setDrag(null);
                }}
                onDragEnd={() => setDrag(null)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of arbitrary public URLs */}
                <img
                  src={img.src}
                  alt={img.alt || `صورة ${i + 1}`}
                  draggable={false}
                  style={{ objectPosition: img.position }}
                  onLoad={(e) => {
                    const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
                    setSizes((m) => (m[img.src]?.width === width ? m : { ...m, [img.src]: { width, height } }));
                  }}
                />
                {i === 0 && <span className="adm-pimg-badge">الرئيسية</span>}
                {i === 1 && <span className="adm-pimg-badge alt">عند المرور</span>}
                {small && (
                  <span className="adm-pimg-warn" title={`صغيرة جدًا (${sizes[img.src].width}×${sizes[img.src].height}) وهتظهر مغبّشة`}>
                    صغيرة
                  </span>
                )}
                <button type="button" className="adm-pimg-x" aria-label={`شيل الصورة ${i + 1}`} onClick={() => remove(i)}>
                  <Icon name="close" size={14} />
                </button>
                <div className="adm-pimg-foot" data-pop={`${uid}-${i}`}>
                  <button
                    type="button"
                    className="adm-pimg-set"
                    aria-expanded={open === i}
                    aria-controls={`${uid}-pop-${i}`}
                    onClick={() => setOpen(open === i ? null : i)}
                  >
                    إعدادات
                  </button>
                  {open === i && (
                    <div className="adm-pop" id={`${uid}-pop-${i}`} role="dialog" aria-label={`إعدادات الصورة ${i + 1}`}>
                      <div className="adm-f">
                        <label htmlFor={`${uid}-alt-${i}`}>وصف الصورة</label>
                        <input id={`${uid}-alt-${i}`} type="text" value={img.alt} maxLength={200} placeholder="للقراء الصوتيين ومحركات البحث" onChange={(e) => patch(i, { alt: e.target.value })} autoFocus />
                      </div>
                      <div className="adm-f">
                        <label htmlFor={`${uid}-pos-${i}`}>تركيز الصورة</label>
                        <select id={`${uid}-pos-${i}`} value={img.position} onChange={(e) => patch(i, { position: e.target.value })}>
                          {!POSITIONS.some((p) => p.value === img.position) && <option value={img.position}>{img.position}</option>}
                          {POSITIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </div>
                      {small && <p className="adm-err">الصورة دي صغيرة جدًا ({sizes[img.src].width}×{sizes[img.src].height} بكسل). ارفع الصورة الأصلية.</p>}
                      <div className="adm-pop-actions">
                        <button type="button" className="adm-btn ghost sm" disabled={i === 0} onClick={() => { moveTo(i, i - 1); setOpen(i - 1); }}>قدّم</button>
                        <button type="button" className="adm-btn ghost sm" disabled={i === images.length - 1} onClick={() => { moveTo(i, i + 1); setOpen(i + 1); }}>أخّر</button>
                        <button type="button" className="adm-btn sm" onClick={() => setOpen(null)}>تم</button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!full && (
        <label
          htmlFor={`${uid}-file`}
          className="adm-drop"
          data-over={dropOver || undefined}
          aria-disabled={busy !== null || undefined}
          onDragOver={(e) => {
            if (drag || !e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDropOver(true);
          }}
          onDragLeave={() => setDropOver(false)}
          onDrop={(e) => {
            if (drag) return;
            e.preventDefault();
            setDropOver(false);
            void upload(e.dataTransfer.files);
          }}
        >
          <Icon name="upload" size={22} />
          <span className="adm-drop-title">اسحب الصور هنا أو <u>اختار من جهازك</u></span>
          <span className="adm-hint">PNG أو JPG أو WEBP، حتى 5 ميجا، وأقل ضلع {MIN_IMAGE_SIDE} بكسل. لحد {max} صور.</span>
        </label>
      )}

      {busy && (
        <div role="status" className="adm-pimgs-busy">
          <span className="adm-hint">{busy.stage === "compress" ? `بيجهّز ${busy.name}…` : `بيترفع ${busy.name}… ${busy.pct}%`}</span>
          <div className="adm-bar"><i style={{ width: `${busy.pct}%` }} /></div>
        </div>
      )}
      {!busy && uploaded.length > 0 && (
        <ul className="adm-uploaded" aria-label="آخر صور اترفعت">
          {uploaded.map((u, k) => (
            <li key={k}>
              <span dir="auto">{u.name}</span> · <bdi dir="ltr">{formatBytes(u.size)}</bdi>
              {u.size < u.originalSize && <span className="adm-hint"> (كانت <bdi dir="ltr">{formatBytes(u.originalSize)}</bdi>)</span>}
            </li>
          ))}
        </ul>
      )}
      {error && <span className="adm-err" role="alert">{error}</span>}
    </div>
  );
}
