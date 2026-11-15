import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/admin/LoginForm";
import { getAdmin } from "@/lib/admin/auth";

export const metadata = { title: "تسجيل الدخول" };

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginGate />
    </Suspense>
  );
}

async function LoginGate() {
  if (await getAdmin()) redirect("/admin");
  return (
    <main id="main" className="adm-login">
      <LoginForm />
    </main>
  );
}
