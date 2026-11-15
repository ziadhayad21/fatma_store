"use server";

import { allow, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { backendConfigured, createServiceClient } from "@/lib/supabase/admin";

export type NewsletterState = { status: "idle" | "ok" | "error"; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function subscribeNewsletter(_prev: NewsletterState, formData: FormData): Promise<NewsletterState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) {
    return { status: "error", message: "اكتب بريد إلكتروني صحيح." };
  }
  if (!backendConfigured()) {
    return { status: "error", message: "الاشتراك مش متاح دلوقتي." };
  }
  if (!(await allow("newsletter"))) return { status: "error", message: RATE_LIMITED_MESSAGE };
  const { error } = await createServiceClient().from("newsletter_subscribers").insert({ email });
  // 23505 = already subscribed: answer exactly like a success (don't reveal who is on the list)
  if (error && error.code !== "23505") {
    console.error("newsletter insert failed", error.message);
    return { status: "error", message: "حصلت مشكلة. جرّب تاني بعد شوية." };
  }
  return { status: "ok", message: "تمام! هتوصلك الأخبار الجديدة." };
}
