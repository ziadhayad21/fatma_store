import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Admin only: refreshes the Supabase session cookie and does an optimistic redirect to the login
 * page. Real authorization happens in lib/admin/auth.ts on every page and Server Action.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const isLogin = pathname === "/admin/login";

  let response = NextResponse.next({ request });
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "no-store");

  if (!url || !key) {
    return isLogin ? response : NextResponse.redirect(new URL("/admin/login", request.url));
  }

  let origin = url;
  try {
    origin = new URL(url).origin;
  } catch {}

  const supabase = createServerClient(origin, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        response.headers.set("X-Robots-Tag", "noindex, nofollow");
        response.headers.set("Cache-Control", "no-store");
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  // A proxy redirect would replay the POST on the login page. Let the action's
  // authorization check produce the redirect in Next.js's action response.
  const isServerAction = request.method === "POST" && request.headers.has("next-action");
  if (!data.user && !isLogin && !isServerAction) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return response;
}

export const config = { matcher: ["/admin/:path*"] };
