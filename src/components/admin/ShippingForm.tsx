"use client";

import { useActionState } from "react";
import { saveShipping, type ShippingState } from "@/app/actions/admin-shipping";

type Rate = { governorate: string; fee: number | null };

export function ShippingForm({ rates }: { rates: Rate[] }) {
  const [state, action, pending] = useActionState<ShippingState, FormData>(saveShipping, { ok: false, message: "" });
  return (
    <form action={action}>
      <div className="adm-ship">
        {rates.map((r) => (
          <label key={r.governorate} className={r.fee === null ? "unset" : ""}>
            <span>{r.governorate}</span>
            <input
              type="text"
              inputMode="decimal"
              name={`fee:${r.governorate}`}
              defaultValue={r.fee === null ? "" : String(r.fee)}
              placeholder="غير متاح"
              aria-label={`سعر الشحن إلى ${r.governorate}`}
              aria-invalid={state.errors?.[r.governorate] ? true : undefined}
              dir="ltr"
            />
            <small>ج.م</small>
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 20, flexWrap: "wrap" }}>
        <button className="adm-btn" type="submit" disabled={pending}>{pending ? "جاري الحفظ…" : "حفظ الأسعار"}</button>
        {state.message && <span className={state.ok ? "adm-ok" : "adm-err"} role="status">{state.message}</span>}
      </div>
    </form>
  );
}
