import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";

export default function PanelLayout({ children }: LayoutProps<"/admin">) {
  // Everything here reads the session cookie → request-time only, behind one Suspense boundary.
  return (
    <Suspense fallback={<div className="adm-loading" aria-busy="true">جاري التحميل…</div>}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
