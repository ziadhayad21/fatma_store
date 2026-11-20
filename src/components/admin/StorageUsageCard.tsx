import { PLAN_LIMITS, type StorageUsage } from "@/lib/storage";

const MB = 1024 * 1024;
const mb = (b: number) => (b / MB >= 100 ? Math.round(b / MB).toString() : (b / MB).toFixed(1));
const BUCKET_AR: Record<string, string> = { designs: "تصاميم العملاء", "payment-proofs": "إثباتات التحويل", "product-images": "صور المنتجات" };

function Bar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, (used / limit) * 100);
  const level = pct >= 90 ? "high" : pct >= 70 ? "mid" : "ok";
  return (
    <div className="adm-usage">
      <div className="adm-usage-top">
        <span>{label}</span>
        <span dir="ltr">
          <b>{mb(used)}</b> / {limit >= 1024 * MB ? `${limit / (1024 * MB)} GB` : `${limit / MB} MB`}
        </span>
      </div>
      <div className="adm-usage-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} data-level={level}>
        <i style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <span className="adm-hint">{pct < 1 ? "أقل من 1%" : `${Math.round(pct)}%`} من حد الخطة المجانية</span>
    </div>
  );
}

/** Database size and stored files against the free-plan limits (numbers read on the server). */
export function StorageUsageCard({ usage }: { usage: StorageUsage | null }) {
  return (
    <section className="adm-card adm-storage" aria-labelledby="storage-usage">
      <h2 id="storage-usage">المساحة المستخدمة</h2>
      {usage ? (
        <>
          <Bar label="قاعدة البيانات" used={usage.dbBytes} limit={PLAN_LIMITS.dbBytes} />
          <Bar label="الملفات (Storage)" used={usage.storageBytes} limit={PLAN_LIMITS.storageBytes} />
          {Object.keys(usage.buckets).length > 0 && (
            <ul className="adm-usage-buckets">
              {Object.entries(usage.buckets)
                .sort((a, b) => b[1] - a[1])
                .map(([bucket, bytes]) => (
                  <li key={bucket}>
                    <span>{BUCKET_AR[bucket] ?? bucket}</span>
                    <span dir="ltr">{mb(bytes)} MB</span>
                  </li>
                ))}
            </ul>
          )}
        </>
      ) : (
        <p className="adm-hint">تعذّر قراءة المساحة دلوقتي.</p>
      )}
    </section>
  );
}
