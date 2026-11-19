import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { hasSupabase } from "@/lib/env";
import { createSessionClient } from "@/lib/supabase/server";

export type AdminContext = { supabase: SupabaseClient; user: User };

/**
 * The authorization check for every admin page and action (the proxy only does an optimistic redirect).
 * 1) the session cookie must belong to a real Auth user (validated with the Auth server), and
 * 2) public.is_admin() must be true for that user.
 * All admin data access then goes through this user-bound client, so Row Level Security still applies.
 */
export async function getAdmin(): Promise<AdminContext | null> {
  if (!hasSupabase) return null;
  // Always request-time: the session check compares token expiry with the current time (Date.now()).
  // Without this, Cache Components' runtime prefetch (cookies available, still a prerender) reports
  // "unstable value Date.now() while prerendering" on every admin page.
  await connection();
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: isAdmin, error: rpcError } = await supabase.rpc("is_admin");
  if (rpcError || isAdmin !== true) return null;
  return { supabase, user: data.user };
}

export async function requireAdmin(): Promise<AdminContext> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
