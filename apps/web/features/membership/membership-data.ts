import { createClient } from "@/lib/supabase/server";
import {
  resolveMembershipStatus,
  UNAVAILABLE_MEMBERSHIP,
  type MembershipStatusView,
} from "./membership-status";

export async function loadMembershipStatus(userId: string): Promise<MembershipStatusView> {
  if (!userId) return UNAVAILABLE_MEMBERSHIP;
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke("get-membership-entitlements", { body: {} });

  if (error) {
    console.error("[membership.load] Failed to load membership status", { code: error.code });
    return UNAVAILABLE_MEMBERSHIP;
  }
  if (!data || typeof data !== "object") return UNAVAILABLE_MEMBERSHIP;
  return resolveMembershipStatus(data as Record<string, unknown>);
}
