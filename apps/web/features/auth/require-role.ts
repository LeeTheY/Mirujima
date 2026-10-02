import type { User } from "@supabase/supabase-js";
import type { UserRole } from "@mirujima/contracts";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHref } from "./login-destination";
import { resolveAccess } from "./route-access";

export const requireAuthenticatedRole = cache(async function requireAuthenticatedRole(
  pathname: string,
): Promise<{ user: User; role: UserRole }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  const { data: profile, error: profileError } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null, error: null };
  if (profileError) redirect(loginHref(pathname, "profile"));
  const decision = resolveAccess(pathname, user?.id ?? null, profile?.role);

  if ("redirectTo" in decision) redirect(decision.redirectTo === "/login" ? loginHref(pathname) : decision.redirectTo);
  return { user: user!, role: decision.role };
});
