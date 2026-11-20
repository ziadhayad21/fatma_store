"use client";

import { useId, useState, useTransition } from "react";
import { previewCleanup, runCleanup, type CleanupPreview, type CleanupResult } from "@/app/actions/admin-storage";
import { CLEANUP_MONTHS, DEFAULT_CLEANUP_MONTHS, megabytes } from "@/lib/admin/cleanup";

/**
 * "تنظيف الملفات القديمة": deletes the designs and transfer proofs of delivered / cancelled orders older than
 * N months. Orders and their items stay. A preview always comes first.
 */
export function CleanupCard({
  preview: previewAction = previewCleanup,
  run: runAction = runCleanup,
}: {
  /** injectable server actions (defaults: the real ones) */
  preview?: (months: number) => Promise<CleanupPreview>;
  run?: (months: number) => Promise<CleanupResult>;
} = {}) {
  const uid = useId();
  const [months, setMonths] = useState<number>(DEFAULT_CLEANUP_MONTHS);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [pending, start] = useTransition();
  const ready = preview?.ok && preview.months === months && preview.files > 0;

  const check = () =>
    start(async () => {
      setResult(null);
      setPreview(await previewAction(months).catch(() => ({ ok: false as const, message: "تعذّر حساب الملفات. جرّب تاني." })));
    });
  const run = () =>
    start(async () => {
      const r = await runAction(months).catch(() => ({ ok: false as const, message: "التنظيف ما تمش. جرّب تاني." }));
      setResult(r);
      setPreview(null);
    });

  return (
    <section className="adm-card adm-cleanup" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>تنظيف الملفات القديمة</h2>
      <p className="adm-hint">
        بيمسح تصاميم العملاء وصور إثبات التحويل للطلبات اللي <b>وصلت</b> أو <b>اتكنسلت</b> من مدة. الطلبات نفسها ومنتجاتها بتفضل موجودة.
      </p>
      <div className="adm-cleanup-row">
        <label htmlFor={`${uid}-m`}>أقدم من</label>
        <select
          id={`${uid}-m`}
          value={months}
          onChange={(e) => {
            setMonths(Number(e.target.value));
            setPreview(null);
            setResult(null);
          }}
        >
          {CLEANUP_MONTHS.map((m) => (
            <option key={m} value={m}>{m === 12 ? "سنة" : `${m} شهور`}</option>
          ))}
        </select>
        <button type="button" className="adm-btn ghost" onClick={check} disabled={pending}>
          {pending && !ready ? "بيحسب…" : "معاينة"}
        </button>
      </div>

      <div aria-live="polite">
        {preview && !preview.ok && <p className="adm-err">{preview.message}</p>}
        {preview?.ok && preview.files === 0 && <p className="adm-cleanup-note">مفيش ملفات قديمة تتمسح دلوقتي.</p>}
        {ready && preview?.ok && (
          <div className="adm-cleanup-preview">
            <p>
              هيتمسح <b>{preview.files}</b> {preview.files === 1 ? "ملف" : "ملف"}، حوالي <b>{megabytes(preview.bytes)}</b>
              <span className="adm-hint"> (من {preview.orders} {preview.orders === 1 ? "طلب" : "طلب"})</span>
            </p>
            <button type="button" className="adm-btn adm-delete-btn" onClick={run} disabled={pending}>
              {pending ? "جاري المسح…" : "امسح الملفات"}
            </button>
          </div>
        )}
        {result && !result.ok && <p className="adm-err">{result.message}</p>}
        {result?.ok && (
          <p className="adm-ok adm-cleanup-done">
            {result.files ? <>اتمسح {result.files} ملف (حوالي {megabytes(result.bytes)}) من {result.orders} طلب.</> : "مفيش ملفات اتمسحت."}
            {result.failed > 0 && <> {result.failed} ملف ما اتمسحش، جرّب تاني.</>}
          </p>
        )}
      </div>
    </section>
  );
}
