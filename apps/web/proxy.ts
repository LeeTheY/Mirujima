import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabasePublicConfig, getSupabasePublicConfig } from "@/lib/supabase/config";

const publicPaths = new Set(["/", "/onboarding", "/auth/callback"]);

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
  const isPublic = publicPaths.has(request.nextUrl.pathname);
  if (!data?.claims?.sub && !isPublic) return NextResponse.redirect(new URL("/onboarding", request.url));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons|favicon.ico|sw.js|manifest.webmanifest).*)"],
};
