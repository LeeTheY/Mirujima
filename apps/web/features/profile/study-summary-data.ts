import { guardianRewardRequestListSchema } from "@mirujima/contracts";
import { createClient } from "@/lib/supabase/server";
import { dateKeyInTimeZone } from "@/features/history/history-query";
import { loadStudentFocusHistory } from "@/features/history/history-data";

export async function loadOwnMonthlyStudySummary(userId: string) {
  const client = await createClient();
  const { data: profile, error } = await client.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  if (error) return null;
  try {
    const today = dateKeyInTimeZone(new Date(), profile?.timezone ?? "Asia/Seoul");
    return (await loadStudentFocusHistory("monthly", today, client)).data?.summary ?? null;
  } catch { return null; }
}

export async function loadGuardianPendingRewardCount(): Promise<number | null> {
  try {
    const client = await createClient();
    const { data, error } = await client.rpc("get_guardian_reward_requests", { p_status: "pending" });
    if (error) return null;
    const parsed = guardianRewardRequestListSchema.safeParse(data);
    return parsed.success ? parsed.data.items.filter((item) => item.status === "pending").length : null;
  } catch { return null; }
}
