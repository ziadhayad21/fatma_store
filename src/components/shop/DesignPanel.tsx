"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { formatBytes } from "@/lib/image-compress";
import { DESIGN_ACCEPT, validateImageBeforeCompression } from "@/lib/personalization";
import { useDesignUrls } from "@/components/cart/useDesignUrls";
import { designUploader, UploadError } from "@/lib/upload";

export type DesignState =
  | { status: "idle" }
  | { status: "uploading"; name: string; progress: number; previewUrl: string; stage?: "compress" | "upload" }
  // previewUrl is null when restored from the cart (a signed URL is fetched instead); size = stored bytes
  | { status: "done"; name: string; path: string; previewUrl: string | null; size?: number };

type Props = { value: DesignState; onChange: (s: DesignState) => void };

/**
 * Drag & drop upload. The file goes to the (private) bucket immediately, with progress;
 * the cart line only stores the returned path + original file name.
 */
export function DesignPanel({ value, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const token = useRef(0); // ignores results of superseded uploads
  const own = useRef(new Set<string>()); // paths uploaded by THIS panel — the only ones it may delete
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });
  const id = useId();
  const signed = useDesignUrls(value.status === "done" && !value.previewUrl ? [value.path] : []);
  const thumb = value.status === "idle" ? null : (value.previewUrl ?? signed[(value as { path?: string }).path ?? ""] ?? null);

  // free the object URL when the panel goes away
  useEffect(
    () => () => {
      const v = latest.current;
      if (v.status !== "idle" && v.previewUrl) URL.revokeObjectURL(v.previewUrl);
    },
    [],
  );

  async function take(file: File | undefined) {
    if (!file) return;
    // the stored size (max 10 MB) is checked by the server after the (lossless) preparation
    const check = validateImageBeforeCompression(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError("");
    const my = ++token.current;
    const previous = value;
    const previewUrl = URL.createObjectURL(file);
    let stage: "compress" | "upload" = "compress";
    let progress = 0;
    const report = () => {
      if (token.current === my) onChange({ status: "uploading", name: file.name, progress, previewUrl, stage });
    };
    report();
    try {
      const res = await designUploader.upload(
        file,
        (p) => {
          progress = p;
          report();
        },
        (s) => {
          stage = s;
          report();
        },
      );
      if (token.current !== my) return;
      own.current.add(res.path);
      onChange({ status: "done", name: res.name, path: res.path, previewUrl, size: res.size });
      if (previous.status === "done" && own.current.has(previous.path)) {
        void designUploader.remove(previous.path).catch(() => {});
      }
      if (previous.status !== "idle" && previous.previewUrl) URL.revokeObjectURL(previous.previewUrl);
    } catch (e) {
      if (token.current !== my) return;
      URL.revokeObjectURL(previewUrl);
      onChange(previous.status === "uploading" ? { status: "idle" } : previous);
      setError(e instanceof UploadError ? e.message : "الرفع فشل. جرّب تاني.");
    }
  }

  function clear() {
    token.current++;
    if (value.status === "done" && own.current.has(value.path)) void designUploader.remove(value.path).catch(() => {});
    if (value.status !== "idle" && value.previewUrl) URL.revokeObjectURL(value.previewUrl);
    setError("");
    onChange({ status: "idle" });
  }

  return (
    <div className="panel">
      <input
        ref={input}
        id={id}
        className="vh"
        type="file"
        accept={DESIGN_ACCEPT}
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {value.status === "idle" && (
        <label
          className={`drop${over ? " over" : ""}`}
          htmlFor={id}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void take(e.dataTransfer.files?.[0]);
          }}
        >
          <Icon name="upload" size={26} />
          <span style={{ fontSize: 15, fontWeight: 500 }}>
            اسحب التصميم هنا أو <span style={{ textDecoration: "underline", textUnderlineOffset: 4 }}>اختار ملف</span>
          </span>
          <span className="muted" style={{ fontSize: 13 }}>PNG أو JPG — الخلفية الشفافة بتطلع أحسن</span>
        </label>
      )}

      {value.status !== "idle" && (
        <div className="file-row">
          <span className="thumb">
            {thumb && (
              // eslint-disable-next-line @next/next/no-img-element -- blob/signed URL preview, not optimizable
              <img src={thumb} alt="التصميم اللي رفعته" />
            )}
          </span>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} dir="auto">
              {value.name}
            </span>
            {value.status === "uploading" ? (
              <>
                <span className="muted" style={{ fontSize: 12 }} role="status">
                  {value.stage === "compress" ? "بيجهّز الملف…" : `بيترفع… ${value.progress}%`}
                </span>
                <span className="bar-p" aria-hidden="true"><i style={{ width: `${value.progress}%` }} /></span>
              </>
            ) : (
              <span className="muted" style={{ fontSize: 12 }} role="status">
                اترفع بنجاح{value.size ? <> · <bdi dir="ltr">{formatBytes(value.size)}</bdi></> : null}
              </span>
            )}
          </div>
          {value.status === "done" && (
            <button type="button" className="rm" onClick={() => input.current?.click()}>غيّره</button>
          )}
          <button type="button" className="rm" onClick={clear}>شيل</button>
        </div>
      )}

      {error && <span className="err" role="alert">{error}</span>}
    </div>
  );
}
