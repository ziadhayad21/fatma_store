import { signOut } from "@/app/actions/admin-auth";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminNav } from "./AdminNav";

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return (
    <div className="adm-shell">
      <aside className="adm-side">
        <div className="adm-brand">فاطمة <span>لوحة التحكم</span></div>
        <AdminNav />
        <div className="adm-user">
          <span dir="ltr">{user.email}</span>
          <form action={signOut}>
            <button type="submit" className="adm-link-btn">تسجيل الخروج</button>
          </form>
          <a href="/" className="adm-link-btn" target="_blank" rel="noreferrer">فتح الموقع ↗</a>
        </div>
      </aside>
      <div className="adm-main">{children}</div>
    </div>
  );
}
