"use server";

import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/admin/auth";
import { allow, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { hasSupabase } from "@/lib/env";
import { createSessionClient } from "@/lib/supabase/server";

export type LoginState = { error: string };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!hasSupabase) return { error: "Supabase مش متظبط." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password || email.length > 254 || password.length > 200) {
    return { error: "اكتب الإيميل وكلمة السر." };
  }

  if (!(await allow("login"))) return { error: RATE_LIMITED_MESSAGE };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "الإيميل أو كلمة السر غلط." }; // same message for every failure

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) {
    await supabase.auth.signOut();
    return { error: "الحساب ده مش مسموح له بدخول لوحة التحكم." };
  }
  redirect("/admin");
}

export async function signOut() {
  const admin = await getAdmin();
  const supabase = admin?.supabase ?? (await createSessionClient());
  await supabase.auth.signOut();
  redirect("/admin/login");
}
