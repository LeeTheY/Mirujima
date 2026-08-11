"use server";

import { userRoleSchema } from "@mirujima/contracts";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { reportRoleSelectionError } from "./role-error";
import { destinationForRole, resolvePersistedRole, resolveRoleSelection } from "./role-routing";

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
  if (authError || !authData.user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  const storedRole = userRoleSchema.safeParse(profile?.role);
  const decision = resolveRoleSelection(storedRole.success ? storedRole.data : null, role);
  if (!decision.shouldPersist) redirect(destinationForRole(decision.role));

  const { data, error } = await supabase.rpc("set_profile_role", {
    p_role: role,
    p_timezone: timezone,
    p_locale: "ko-KR",
  });
  if (error?.code === "P0001" && error.message === "role is already set") {
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();
    const currentRole = userRoleSchema.safeParse(currentProfile?.role);
    if (currentRole.success) redirect(destinationForRole(currentRole.data));
  }
  if (error) throw new Error(reportRoleSelectionError(error));
  const persistedRole = resolvePersistedRole(data);
  if (!persistedRole) {
    throw new Error(reportRoleSelectionError({
      code: "INVALID_RPC_RESPONSE",
      message: "set_profile_role returned no persisted role",
      details: JSON.stringify(data),
      hint: null,
    }));
  }
  redirect(destinationForRole(persistedRole));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) {
    console.error("[auth.signOut] Supabase session termination failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  redirect("/");
}
