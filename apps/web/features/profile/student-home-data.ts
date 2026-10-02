import { canonicalFocusSessionSchema } from "@mirujima/contracts";
import { createClient } from "@/lib/supabase/server";
import { dateKeyInTimeZone } from "@/features/history/history-query";
import { loadStudentFocusHistory } from "@/features/history/history-data";
import { parseHomePlans } from "./home-plans";
import { profileDisplayName } from "./profile-display";

export async function loadStudentHomeData(userId: string) {
  const client = await createClient();
  const profile = await client.from("profiles").select("display_name,timezone").eq("id", userId).maybeSingle();
  let today = dateKeyInTimeZone();
  let profileFailed = Boolean(profile.error);
  try { today = dateKeyInTimeZone(new Date(), profile.data?.timezone ?? "Asia/Seoul"); }
  catch { profileFailed = true; }
  const [history, recent, planRows, sessionRow] = await Promise.all([
    loadStudentFocusHistory("daily", today, client),
    loadStudentFocusHistory("weekly", today, client),
    client.from("cloud_schedules").select("payload").eq("user_id", userId).is("deleted_at", null).eq("payload->>dateKey", today).order("updated_at", { ascending: false }).limit(101),
    client.rpc("get_current_focus_session"),
  ]);
  const plans = profileFailed || planRows.error ? null : parseHomePlans(planRows.data, userId);
  const session = canonicalFocusSessionSchema.safeParse(sessionRow.data);
  return {
    today,
    displayName: profileDisplayName(profile.data?.display_name),
    profileFailed,
    plans,
    plansTruncated: Boolean(plans && plans.length > 100),
    history: profileFailed ? { data: null, error: "기준 날짜를 확인하지 못했습니다. 계정 정보를 다시 확인해 주세요." } : history,
    recent: profileFailed ? { data: null, error: "기록 기준 날짜를 확인하지 못했습니다. 다시 확인해 주세요." } : recent,
    session: session.success && session.data.ownerUserId === userId ? session.data : null,
    sessionFailed: Boolean(sessionRow.error || (sessionRow.data !== null && !session.success)),
  };
}
