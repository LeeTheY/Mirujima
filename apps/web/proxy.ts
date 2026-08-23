import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routeAccess } from "@/features/auth/route-access";
import { hasSupabasePublicConfig, getSupabasePublicConfig } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  if (!hasSupabasePublicConfig()) return NextResponse.next();
  let response = NextResponse.next({ request });
  const config = getSupabasePublicConfig();
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const isPublic = routeAccess(request.nextUrl.pathname) === "public";
  if (!data?.claims?.sub && !isPublic) return NextResponse.redirect(new URL("/login", request.url));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons|favicon.ico|sw.js|manifest.webmanifest).*)"],
};
