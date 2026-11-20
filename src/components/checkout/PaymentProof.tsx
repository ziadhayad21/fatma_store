"use client";

import { useState } from "react";
import { formatBytes } from "@/lib/image-compress";
import { validateImageBeforeCompression } from "@/lib/personalization";
import { uploadPaymentProof, UploadError, type UploadStage } from "@/lib/upload";

/** Deposit transfer proof: compressed in the browser (WebP, max 1280px), then uploaded to the private bucket. */
export function PaymentProof({ onChange, onBusy }: { onChange: (path: string | null) => void; onBusy: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<UploadStage>("compress");
  const [stored, setStored] = useState<{ name: string; size: number; originalSize: number } | null>(null);
  async function upload(file?: File) {
    if (busy || !file) return true;
    onChange(null);
    setMessage("");
    setStored(null);
    const check = validateImageBeforeCompression(file);
    if (!check.ok) { setMessage(check.error); return false; }
    setBusy(true); onBusy(true); setProgress(0); setStage("compress");
    try {
      const res = await uploadPaymentProof(file, { onProgress: setProgress, onStage: setStage });
      onChange(res.path);
      setStored({ name: file.name, size: res.size, originalSize: res.originalSize });
      setMessage("تم رفع إثبات التحويل. العربون في انتظار مراجعة الإدارة.");
      return true;
    } catch (error) {
      setMessage(error instanceof UploadError || error instanceof Error ? error.message : "تعذّر رفع إثبات التحويل. جرّب تاني.");
      return false;
    } finally { setBusy(false); onBusy(false); }
  }
  return <div className="fld">
    <label htmlFor="payment-proof">صورة إثبات تحويل العربون (مطلوب)</label>
    <input id="payment-proof" className="proof-file-input" type="file" accept="image/png,image/jpeg,image/webp" required disabled={busy} onChange={async (e) => {
      const input = e.currentTarget;
      if (!(await upload(input.files?.[0]))) input.value = "";
    }} />
    <span className="muted">PNG / JPG / WEBP — بنصغّرها تلقائيًا قبل الرفع</span>
    <p role="status" aria-live="polite">
      {busy ? (stage === "compress" ? "بيجهّز الصورة…" : `جاري رفع الإثبات… ${progress}%`) : message}
      {!busy && stored && (
        <span className="muted proof-size" dir="auto"> {stored.name} · <bdi dir="ltr">{formatBytes(stored.size)}</bdi></span>
      )}
    </p>
  </div>;
}
