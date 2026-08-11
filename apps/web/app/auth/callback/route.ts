import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { destinationForRole } from "@/features/auth/role-routing";
import { userRoleSchema } from "@mirujima/contracts";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
  const { data: authData } = await supabase.auth.getUser();
  const { data: profile } = authData.user
    ? await supabase.from("profiles").select("role").eq("id", authData.user.id).maybeSingle()
    : { data: null };
  const parsedRole = userRoleSchema.safeParse(profile?.role);
  return NextResponse.redirect(new URL(destinationForRole(parsedRole.success ? parsedRole.data : null), url.origin));
}
