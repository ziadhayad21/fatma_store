import { signOut } from "@/app/actions/admin-auth";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminNav } from "./AdminNav";

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  const initial = user.email ? user.email.charAt(0).toUpperCase() : "F";

  return (
    <div className="adm-shell">
      <aside className="adm-side">
        <div className="adm-brand">
          <div className="adm-brand-emblem">{initial}</div>
          <div>
            <div className="adm-brand-name">Fatima</div>
            <span className="adm-brand-sub">Store Admin</span>
          </div>
        </div>

        <AdminNav />

        <div className="adm-user">
          <div className="adm-user-profile">
            <div className="adm-avatar">{initial}</div>
            <div className="adm-user-details">
              <span className="adm-user-name">Store Admin</span>
              <span className="adm-user-email" dir="ltr">{user.email}</span>
            </div>
          </div>
          <div className="adm-user-actions">
            <form action={signOut}>
              <button type="submit" className="adm-link-btn">تسجيل الخروج • Sign Out</button>
            </form>
            <a href="/" className="adm-link-btn" target="_blank" rel="noreferrer">زيارة المتجر • View Store ↗</a>
          </div>
        </div>
      </aside>

      <div className="adm-main">
        {children}
      </div>
    </div>
  );
}
