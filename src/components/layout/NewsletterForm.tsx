"use client";

import { useActionState } from "react";
import { subscribeNewsletter, type NewsletterState } from "@/app/actions/newsletter";

const initial: NewsletterState = { status: "idle", message: "" };

export function NewsletterForm() {
  const [state, action, pending] = useActionState(subscribeNewsletter, initial);
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12 }} noValidate>
      <h2 className="fh" style={{ margin: 0 }}>خليك قريب</h2>
      <label htmlFor="nl-mail" className="muted" style={{ fontSize: 14 }}>
        اعرف أول بأول بالتصميمات الجديدة.
      </label>
      <div style={{ display: "flex" }}>
        <input
          id="nl-mail"
          name="email"
          className="inp"
          type="email"
          required
          autoComplete="email"
          placeholder="بريدك الإلكتروني"
          aria-invalid={state.status === "error"}
        />
        <button type="submit" className="btn btn-d" style={{ padding: "0 22px" }} disabled={pending}>
          اشترك
        </button>
      </div>
      {state.status !== "idle" && (
        <span className="rise" role="status" style={{ fontSize: 13, color: state.status === "ok" ? "var(--accent)" : "#b00020" }}>
          {state.message}
        </span>
      )}
    </form>
  );
}
