import { callbackOrigin } from "@/features/auth/callback-origin";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { destinationAfterLogin, loginHref, safeLoginDestination } from "@/features/auth/login-destination";
import { userRoleSchema } from "@mirujima/contracts";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = callbackOrigin(process.env.NEXT_PUBLIC_APP_ORIGIN, url.origin);
  const next = safeLoginDestination(url.searchParams.get("next"));
  if (url.searchParams.has("error")) return NextResponse.redirect(new URL(loginHref(next, url.searchParams.get("error") === "access_denied" ? "cancelled" : "oauth"), origin));
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL(loginHref(next, "oauth"), origin));
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(loginHref(next, "oauth"), origin));
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return NextResponse.redirect(new URL(loginHref(next, "oauth"), origin));
  const { data: profile, error: profileError } = authData.user
    ? await supabase.from("profiles").select("role").eq("id", authData.user.id).maybeSingle()
    : { data: null, error: null };
  if (profileError) return NextResponse.redirect(new URL(loginHref(next, "profile"), origin));
  const parsedRole = userRoleSchema.safeParse(profile?.role);
  return NextResponse.redirect(new URL(destinationAfterLogin(parsedRole.success ? parsedRole.data : null, next), origin));
}
