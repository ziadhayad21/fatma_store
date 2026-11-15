"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "@/app/actions/admin-auth";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, { error: "" });
  return (
    <form action={action}>
      <h1>لوحة تحكم فاطمة</h1>
      <div className="adm-f">
        <label htmlFor="email">الإيميل</label>
        <input id="email" name="email" type="email" autoComplete="username" required dir="ltr" />
      </div>
      <div className="adm-f">
        <label htmlFor="password">كلمة السر</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" />
      </div>
      {state.error && <p className="adm-err" role="alert" style={{ margin: 0 }}>{state.error}</p>}
      <button className="adm-btn" type="submit" disabled={pending}>{pending ? "جاري الدخول…" : "دخول"}</button>
    </form>
  );
}
