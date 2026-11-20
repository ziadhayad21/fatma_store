"use client";

import { useActionState, useId } from "react";
import { moderateSuggestion, type ModerateState } from "@/app/actions/admin-suggestions";
import { REPLY_MAX, SUGGESTION_STATUS_LABEL, SUGGESTION_STATUSES } from "@/lib/suggestions";
import type { SuggestionStatus } from "@/lib/types";

/** Per-suggestion moderation: show on the site, status, optional short reply. */
export function SuggestionModeration({
  id,
  isPublic,
  status,
  reply,
}: {
  id: string;
  isPublic: boolean;
  status: SuggestionStatus;
  reply: string | null;
}) {
  const [state, action, pending] = useActionState<ModerateState, FormData>(moderateSuggestion, { ok: false, message: "" });
  const uid = useId();
  return (
    <form action={action} className="adm-moderate">
      <input type="hidden" name="id" value={id} />
      <label className="adm-check adm-moderate-public">
        <input type="checkbox" role="switch" name="is_public" defaultChecked={isPublic} />
        اعرضه في الموقع
      </label>
      <div className="adm-f adm-moderate-status">
        <label htmlFor={`${uid}-s`}>الحالة</label>
        <select id={`${uid}-s`} name="status" defaultValue={status}>
          {SUGGESTION_STATUSES.map((s) => (
            <option key={s} value={s}>{SUGGESTION_STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>
      <div className="adm-f adm-moderate-reply">
        <label htmlFor={`${uid}-r`}>رد قصير (اختياري، بيظهر تحت الاقتراح)</label>
        <input id={`${uid}-r`} name="admin_reply" type="text" defaultValue={reply ?? ""} maxLength={REPLY_MAX} placeholder="مثلاً: فكرة حلوة! بندرسها دلوقتي." />
      </div>
      <div className="adm-moderate-save">
        <button className="adm-btn" type="submit" disabled={pending}>{pending ? "جاري الحفظ…" : "حفظ"}</button>
        {state.message && <span className={state.ok ? "adm-ok" : "adm-err"} role="status">{state.message}</span>}
      </div>
    </form>
  );
}
