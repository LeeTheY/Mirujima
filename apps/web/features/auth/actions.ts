"use server";

import { userRoleSchema } from "@mirujima/contracts";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { destinationForRole } from "./role-routing";

export async function signInWithGoogle(): Promise<void> {
  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN;
  if (!origin) throw new Error("웹 앱 origin 환경변수가 설정되지 않았습니다.");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback`, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw new Error("Google 로그인 주소를 만들지 못했습니다.");
  redirect(data.url);
}

export async function selectRole(formData: FormData): Promise<void> {
  const role = userRoleSchema.parse(formData.get("role"));
  const timezone = String(formData.get("timezone") || "Asia/Seoul").slice(0, 80);
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/onboarding");
  const { error } = await supabase.rpc("set_profile_role", {
    p_role: role,
    p_timezone: timezone,
    p_locale: "ko-KR",
  });
  if (error) throw new Error("역할을 저장하지 못했습니다.");
  redirect(destinationForRole(role));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
