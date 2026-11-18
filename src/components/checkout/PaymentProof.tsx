"use client";

import { useState } from "react";
import { requestPaymentProofUpload, confirmPaymentProofUpload } from "@/app/actions/payment-proofs";
import { validateDesignFile } from "@/lib/personalization";
import { putWithProgress } from "@/lib/upload";

export function PaymentProof({ onChange, onBusy }: { onChange: (path: string | null) => void; onBusy: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  async function upload(file?: File) {
    if (busy || !file) return true;
    onChange(null);
    setMessage("");
    const check = validateDesignFile(file);
    if (!check.ok) { setMessage(check.error); return false; }
    setBusy(true); onBusy(true); setProgress(0);
    try {
      const ticket = await requestPaymentProofUpload({ type: file.type, size: file.size });
      if (!ticket.ok) throw new Error(ticket.error);
      await putWithProgress(ticket.uploadUrl, file, setProgress);
      const result = await confirmPaymentProofUpload(ticket.path);
      if (!result.ok) throw new Error(result.error);
      onChange(ticket.path); setMessage("تم رفع إثبات التحويل. العربون في انتظار مراجعة الإدارة.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذّر رفع إثبات التحويل. جرّب تاني.");
      return false;
    } finally { setBusy(false); onBusy(false); }
  }
  return <div className="fld">
    <label htmlFor="payment-proof">صورة إثبات تحويل العربون (مطلوب)</label>
    <input id="payment-proof" className="proof-file-input" type="file" accept="image/png,image/jpeg,image/webp" required disabled={busy} onChange={async (e) => {
      const input = e.currentTarget;
      if (!(await upload(input.files?.[0]))) input.value = "";
    }} />
    <span className="muted">PNG / JPG / WEBP — حتى 10 ميجا</span>
    <p role="status" aria-live="polite">{busy ? `جاري رفع الإثبات… ${progress}%` : message}</p>
  </div>;
}
