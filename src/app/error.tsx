"use client";

import { useEffect } from "react";

/** Runtime error boundary for every route (storefront and admin). Shown inside the root layout. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="wrap" style={{ paddingBlock: "96px 112px" }}>
      <div className="empty" data-testid="error-page" role="alert">
        <span className="eyebrow">خطأ</span>
        <h1 style={{ fontSize: 34 }}>حصلت مشكلة من عندنا</h1>
        <p className="muted" style={{ margin: 0 }}>
          ماتقلقش، طلباتك وسلتك في أمان. جرّب تاني، ولو المشكلة فضلت ارجع للرئيسية.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button type="button" className="btn btn-d" onClick={() => retry()}>
            جرّب تاني
          </button>
          {/* plain anchor on purpose: a full reload clears a broken client state */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="btn btn-l" href="/">
            ارجع للرئيسية
          </a>
        </div>
      </div>
    </main>
  );
}
