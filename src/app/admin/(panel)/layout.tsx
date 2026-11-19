import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Opts the admin out of Next's DEV-ONLY "instant navigation" validation (partialPrefetching insight),
 * like the storefront layout. Every admin page checks the session per request (requireAdmin → connection()),
 * so navigation cannot be instant by design. No effect on the build or production output.
 */
export const instant = false;

export default function PanelLayout({ children }: LayoutProps<"/admin">) {
  // Everything here reads the session cookie → request-time only, behind one Suspense boundary.
  return (
    <Suspense fallback={<div className="adm-loading" aria-busy="true">جاري التحميل…</div>}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
