"use server";

import { userRoleSchema } from "@mirujima/contracts";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { reportRoleSelectionError } from "./role-error";
import { resolvePersistedRole, resolveRoleSelection } from "./role-routing";

import { destinationAfterLogin, loginHref, safeLoginDestination } from "./login-destination";

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN;
  const next = safeLoginDestination(formData.get("next"));
  if (!origin) redirect(loginHref(next, "oauth"));
  const callback = new URL("/auth/callback", origin);
  if (next) callback.searchParams.set("next", next);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
  });
  if (error || !data.url) redirect(loginHref(next, "oauth"));
  redirect(data.url);
}

export async function selectRole(formData: FormData): Promise<void> {
  const next = safeLoginDestination(formData.get("next"));
  const parsedRole = userRoleSchema.safeParse(formData.get("role"));
  if (!parsedRole.success) redirect(loginHref(next, "profile"));
  const role = parsedRole.data;
  const timezone = String(formData.get("timezone") || "Asia/Seoul").slice(0, 80);
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect(loginHref(next));
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) redirect(loginHref(next, "profile"));
  const storedRole = userRoleSchema.safeParse(profile?.role);
  const decision = resolveRoleSelection(storedRole.success ? storedRole.data : null, role);
  if (!decision.shouldPersist) redirect(destinationAfterLogin(decision.role, next));

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
    if (currentRole.success) redirect(destinationAfterLogin(currentRole.data, next));
  }
  if (error) { reportRoleSelectionError(error); redirect(loginHref(next, "profile")); }
  const persistedRole = resolvePersistedRole(data);
  if (!persistedRole) {
    reportRoleSelectionError({
      code: "INVALID_RPC_RESPONSE",
      message: "set_profile_role returned no persisted role",
      details: JSON.stringify(data),
      hint: null,
    });
    redirect(loginHref(next, "profile"));
  }
  redirect(destinationAfterLogin(persistedRole, next));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const revoked = await supabase.rpc("revoke_all_push_subscriptions");
  if (revoked.error) throw new Error("기기 알림을 해제하지 못했습니다. 연결을 확인한 뒤 다시 로그아웃해 주세요.");
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
