import {
  canonicalFocusSessionSchema,
  focusPlanSchema,
  remainingFocusMs,
  type CanonicalFocusSession,
  type FocusPlan,
} from "@mirujima/contracts";
import { applyBlockingRules } from "../../background/blocking";
import { ensureFocusCheckAlarm, setFocusEndAlarm } from "../../background/alarms";
import { repository } from "../../shared/storage/repository";
import type { FocusSession, Schedule } from "../../shared/types/models";
import { membershipSupabaseClient } from "../membership/service";

export function canonicalToLocalFocus(plan: FocusPlan, canonical: CanonicalFocusSession): {
  schedule: Schedule;
  session: FocusSession;
} {
  if (plan.id !== canonical.scheduleId) throw new Error("집중 계획과 세션이 일치하지 않습니다.");
  if (plan.ownerUserId !== canonical.ownerUserId) throw new Error("집중 계획과 세션의 소유자가 일치하지 않습니다.");
  const schedule: Schedule = {
    id: plan.id,
    title: plan.title,
    description: plan.description,
    dateKey: plan.dateKey,
    startAt: plan.plannedStartAt ?? canonical.startedAt,
    endAt: canonical.endsAt,
    targetFocusMinutes: canonical.targetFocusMinutes,
    activityMode: plan.activityMode,
    blockingMode: canonical.blockingMode,
    allowedDomains: plan.allowedDomains,
    blockedDomains: plan.blockedDomains,
    breakMinutes: plan.breakMinutes,
    status: "focusing",
    snoozeCount: 0,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    ownerUserId: plan.ownerUserId,
    plannedStartAt: plan.plannedStartAt,
    priority: plan.priority,
    selfDepositPoints: plan.selfDepositPoints,
    guardianRewardRequestPoints: plan.guardianRewardRequestPoints,
    webStatus: "active",
  };
  const session: FocusSession = {
    id: canonical.id,
    scheduleId: canonical.scheduleId,
    dateKey: plan.dateKey,
    startedAt: canonical.startedAt,
    endsAt: canonical.endsAt,
    endedAt: null,
    pausedAt: null,
    accumulatedFocusSeconds: 0,
    distractionSeconds: 0,
    idleSeconds: 0,
    blockedAttemptCount: 0,
    checkInCount: 0,
    status: "active",
    breakEndsAt: null,
    breakStartedAt: null,
    accumulatedBreakSeconds: 0,
    canonical: true,
  };
  return { schedule, session };
}

function payloadOf(row: unknown): unknown {
  if (!row || typeof row !== "object") throw new Error("서버 집중 데이터를 확인할 수 없습니다.");
  return Reflect.get(row, "payload");
}

async function fetchCanonicalFocus(scheduleId: string, sessionId: string) {
  const client = membershipSupabaseClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) throw new Error("확장 프로그램에서 Google 로그인이 필요합니다.");
  const [planResult, sessionResult] = await Promise.all([
    client.from("cloud_schedules").select("payload").eq("entity_id", scheduleId).is("deleted_at", null).single(),
    client.from("cloud_focus_sessions").select("payload").eq("entity_id", sessionId).is("deleted_at", null).single(),
  ]);
  if (planResult.error || sessionResult.error) throw new Error("서버 집중 계획을 불러오지 못했습니다.");
  const plan = focusPlanSchema.parse(payloadOf(planResult.data));
  const session = canonicalFocusSessionSchema.parse(payloadOf(sessionResult.data));
  if (plan.ownerUserId !== authData.user.id || session.ownerUserId !== authData.user.id) {
    throw new Error("현재 로그인 사용자에게 속한 집중 세션이 아닙니다.");
  }
  if (session.status !== "active") throw new Error("시작할 수 있는 집중 세션이 아닙니다.");
  return { plan, session };
}

export async function activateCanonicalFocus(scheduleId: string, sessionId: string, forceRefresh = false): Promise<void> {
  await repository.initialize();
  const current = await repository.getActiveSession();
  if (current?.id === sessionId && current.canonical && !forceRefresh) return;
  if (current && current.id !== sessionId) throw new Error("확장 프로그램에 이미 진행 중인 집중 세션이 있습니다.");
  const canonical = await fetchCanonicalFocus(scheduleId, sessionId);
  const local = canonicalToLocalFocus(canonical.plan, canonical.session);
  const schedules = await repository.getSchedules();
  await repository.setSchedules([...schedules.filter((item) => item.id !== local.schedule.id), local.schedule]);
  await repository.setActiveSession(local.session);
  await applyBlockingRules(local.schedule, local.session, await repository.getTemporaryAllows());
  await setFocusEndAlarm(local.session.id, local.session.endsAt ?? canonical.session.endsAt);
  await ensureFocusCheckAlarm(true);
  await chrome.action.setBadgeBackgroundColor({ color: "#315A4A" });
  await chrome.action.setBadgeText({ text: remainingFocusMs(canonical.session.endsAt) > 0 ? "ON" : "확인" });
}

export async function resyncCanonicalFocus(): Promise<void> {
  const active = await repository.getActiveSession();
  if (!active?.canonical) return;
  await activateCanonicalFocus(active.scheduleId, active.id, true);
}
