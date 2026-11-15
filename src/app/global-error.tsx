"use client";

/**
 * Last resort: replaces the root layout when the layout itself fails. It must define <html>/<body> and
 * cannot rely on the app's stylesheet or fonts, so everything is inline.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: "system-ui, 'Segoe UI', Tahoma, Arial, sans-serif", color: "#141414", background: "#fff" }}>
        <title>حصلت مشكلة | فاطمة</title>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
          <div role="alert" style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 30, margin: "0 0 12px" }}>حصلت مشكلة من عندنا</h1>
            <p style={{ color: "#6b6b6b", margin: "0 0 24px", lineHeight: 1.8 }}>جرّب تاني بعد لحظات، أو ارجع للرئيسية.</p>
            <button
              type="button"
              onClick={() => retry()}
              style={{ background: "#141414", color: "#fff", border: 0, padding: "14px 28px", fontSize: 16, cursor: "pointer", marginInlineEnd: 12 }}
            >
              جرّب تاني
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ color: "#141414", fontSize: 16 }}>الرئيسية</a>
          </div>
        </main>
      </body>
    </html>
  );
}
