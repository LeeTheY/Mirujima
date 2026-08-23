import {
  canonicalFocusSessionSchema,
  focusPlanSchema,
  remainingFocusMs,
  type CanonicalFocusSession,
  type FocusPlan,
} from "@mirujima/contracts";
import { clearBreakEndAlarm, clearFocusEndAlarm, ensureFocusCheckAlarm, setFocusEndAlarm } from "../../background/alarms";
import { applyBlockingRules, clearBlockingRules } from "../../background/blocking";
import { generateReport } from "../../background/reports";
import { repository } from "../../shared/storage/repository";
import type { FocusSession, PendingCanonicalSettlement, Schedule } from "../../shared/types/models";
import { runWithoutCloudQueue } from "../cloud-sync/storage";
import { getOrCreateDeviceId } from "../membership/storage";
import { membershipSupabaseClient } from "../membership/service";

type CanonicalRpcName =
  | "get_current_focus_session"
  | "get_focus_session"
  | "pause_focus_session"
  | "resume_focus_session"
  | "finish_focus_session";

export interface FocusMetricRpcClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown | null }>;
}

export function canonicalMetricPayload(session: FocusSession): {
  blockedAttemptCount: number;
  idleSeconds: number;
  distractionSeconds: number;
  checkInCount: number;
} {
  const safe = (value: number, max: number) => Math.min(max, Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)));
  return {
    blockedAttemptCount: safe(session.blockedAttemptCount, 1_000_000),
    idleSeconds: safe(session.idleSeconds, 31_536_000),
    distractionSeconds: safe(session.distractionSeconds, 31_536_000),
    checkInCount: safe(session.checkInCount, 1_000_000),
  };
}

export async function syncCanonicalMetricsBestEffort(
  session: FocusSession,
  deviceId: string,
  client: FocusMetricRpcClient = membershipSupabaseClient(),
): Promise<boolean> {
  if (!session.canonical) return true;
  try {
    const { error } = await client.rpc("sync_focus_session_metrics", {
      p_session_id: session.id,
      p_device_id: deviceId,
      p_metrics: canonicalMetricPayload(session),
    });
    return error === null;
  } catch {
    return false;
  }
}

function localSessionStatus(status: CanonicalFocusSession["status"]): FocusSession["status"] {
  if (status === "paused") return "paused";
  if (status === "awaiting-result") return "awaiting-result";
  if (status === "success" || status === "failed" || status === "cancelled") return "completed";
  return "active";
}

function localScheduleStatus(status: CanonicalFocusSession["status"]): Schedule["status"] {
  if (status === "paused" || status === "awaiting-result") return "paused";
  if (status === "success") return "completed";
  if (status === "failed" || status === "cancelled") return "incomplete";
  return "focusing";
}

export function canonicalToLocalFocus(plan: FocusPlan, canonical: CanonicalFocusSession): {
  schedule: Schedule;
  session: FocusSession;
} {
  if (plan.id !== canonical.scheduleId) throw new Error("집중 계획과 세션이 일치하지 않습니다.");
  if (plan.ownerUserId !== canonical.ownerUserId) throw new Error("집중 계획과 세션의 소유자가 일치하지 않습니다.");
  const goals = canonical.goals.length > 0 ? canonical.goals : plan.goals;
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
    status: localScheduleStatus(canonical.status),
    snoozeCount: 0,
    createdAt: plan.createdAt,
    updatedAt: canonical.updatedAt,
    ownerUserId: plan.ownerUserId,
    plannedStartAt: plan.plannedStartAt,
    priority: plan.priority,
    selfDepositPoints: canonical.selfDepositPoints || plan.selfDepositPoints,
    guardianRewardRequestPoints: plan.guardianRewardRequestPoints,
    goals,
    webStatus: canonical.status === "success" ? "completed"
      : canonical.status === "failed" || canonical.status === "cancelled" ? "failed"
      : "active",
  };
  const session: FocusSession = {
    id: canonical.id,
    scheduleId: canonical.scheduleId,
    dateKey: plan.dateKey,
    startedAt: canonical.activeSegmentStartedAt ?? canonical.startedAt,
    endsAt: canonical.endsAt,
    endedAt: canonical.result?.settledAt ?? null,
    pausedAt: canonical.pausedAt,
    accumulatedFocusSeconds: canonical.accumulatedFocusSeconds,
    distractionSeconds: 0,
    idleSeconds: 0,
    blockedAttemptCount: 0,
    checkInCount: 0,
    status: localSessionStatus(canonical.status),
    breakEndsAt: null,
    breakStartedAt: null,
    accumulatedBreakSeconds: 0,
    canonical: true,
    goals,
    result: canonical.result,
    activeSegmentStartedAt: canonical.activeSegmentStartedAt,
    remainingFocusSeconds: canonical.remainingFocusSeconds,
    selfDepositPoints: canonical.selfDepositPoints,
    canonicalStatus: canonical.status,
  };
  return { schedule, session };
}

function payloadOf(row: unknown): unknown {
  if (!row || typeof row !== "object") throw new Error("서버 집중 데이터를 확인할 수 없습니다.");
  return Reflect.get(row, "payload");
}

async function requireUserId(): Promise<string> {
  const { data, error } = await membershipSupabaseClient().auth.getUser();
  if (error || !data.user) throw new Error("확장 프로그램에서 Google 로그인이 필요합니다.");
  return data.user.id;
}

async function callSessionRpc(name: CanonicalRpcName, args?: Record<string, unknown>): Promise<CanonicalFocusSession | null> {
  const { data, error } = await membershipSupabaseClient().rpc(name, args);
  if (error) throw new Error("서버 집중 상태를 불러오지 못했습니다.");
  if (data === null) return null;
  const parsed = canonicalFocusSessionSchema.safeParse(data);
  if (!parsed.success) throw new Error("서버 집중 상태 형식을 확인하지 못했습니다.");
  return parsed.data;
}

async function fetchPlan(scheduleId: string, expectedOwnerUserId: string): Promise<FocusPlan> {
  const { data, error } = await membershipSupabaseClient()
    .from("cloud_schedules")
    .select("payload")
    .eq("entity_id", scheduleId)
    .is("deleted_at", null)
    .single();
  if (error) throw new Error("서버 집중 계획을 불러오지 못했습니다.");
  const plan = focusPlanSchema.parse(payloadOf(data));
  if (plan.ownerUserId !== expectedOwnerUserId) throw new Error("현재 로그인 사용자에게 속한 집중 계획이 아닙니다.");
  return plan;
}

async function clearCanonicalRuntime(sessionId: string): Promise<void> {
  await clearBlockingRules();
  await ensureFocusCheckAlarm(false);
  await clearFocusEndAlarm(sessionId);
  await clearBreakEndAlarm(sessionId);
}

async function finalizeCanonicalLocal(local: { schedule: Schedule; session: FocusSession }): Promise<void> {
  const history = await repository.getSessionHistory();
  const current = await repository.getActiveSession();
  const finished: FocusSession = {
    ...(current?.id === local.session.id ? current : local.session),
    ...local.session,
    endedAt: local.session.result?.settledAt ?? local.session.endedAt ?? new Date().toISOString(),
    status: "completed",
  };
  await runWithoutCloudQueue(async () => {
    await repository.setSessionHistory([...history.filter((item) => item.id !== finished.id), finished]);
    await repository.setSchedules([
      ...(await repository.getSchedules()).filter((item) => item.id !== local.schedule.id),
      local.schedule,
    ]);
  });
  await repository.setActiveSession(null);
  await repository.setTemporaryAllows((await repository.getTemporaryAllows()).filter((item) => item.sessionId !== finished.id));
  await repository.setPendingCanonicalSettlements(
    (await repository.getPendingCanonicalSettlements()).filter((item) => item.sessionId !== finished.id),
  );
  await clearCanonicalRuntime(finished.id);
  await chrome.action.setBadgeText({ text: "" });
  await generateReport(finished.dateKey);
}

async function applyCanonicalState(plan: FocusPlan, canonical: CanonicalFocusSession): Promise<void> {
  const local = canonicalToLocalFocus(plan, canonical);
  if (canonical.status === "success" || canonical.status === "failed" || canonical.status === "cancelled") {
    await finalizeCanonicalLocal(local);
    return;
  }
  const current = await repository.getActiveSession();
  const preserved = current?.id === local.session.id ? {
    distractionSeconds: current.distractionSeconds,
    idleSeconds: current.idleSeconds,
    blockedAttemptCount: current.blockedAttemptCount,
    checkInCount: current.checkInCount,
    accumulatedBreakSeconds: current.accumulatedBreakSeconds,
  } : {};
  await runWithoutCloudQueue(async () => repository.setSchedules([
    ...(await repository.getSchedules()).filter((item) => item.id !== local.schedule.id),
    local.schedule,
  ]));
  await repository.setActiveSession({ ...local.session, ...preserved });
  if (canonical.status === "active" || canonical.status === "starting") {
    await applyBlockingRules(local.schedule, local.session, await repository.getTemporaryAllows());
    await setFocusEndAlarm(local.session.id, canonical.endsAt);
    await ensureFocusCheckAlarm(true);
    await chrome.action.setBadgeBackgroundColor({ color: "#315A4A" });
    await chrome.action.setBadgeText({ text: remainingFocusMs(canonical.endsAt) > 0 ? "ON" : "확인" });
    return;
  }
  await clearCanonicalRuntime(local.session.id);
  await chrome.action.setBadgeBackgroundColor({ color: canonical.status === "paused" ? "#75839A" : "#E45A3B" });
  await chrome.action.setBadgeText({ text: canonical.status === "paused" ? "Ⅱ" : "확인" });
}

export async function reconcileCanonicalFocus(scheduleId?: string, sessionId?: string): Promise<CanonicalFocusSession | null> {
  await repository.initialize();
  const localBeforeReconcile = await repository.getActiveSession();
  if (localBeforeReconcile?.canonical && (!sessionId || localBeforeReconcile.id === sessionId)) {
    await syncCanonicalMetricsBestEffort(localBeforeReconcile, await getOrCreateDeviceId());
  }
  const userId = await requireUserId();
  const canonical = sessionId
    ? await callSessionRpc("get_focus_session", { p_session_id: sessionId })
    : await callSessionRpc("get_current_focus_session");
  if (!canonical) {
    const current = await repository.getActiveSession();
    if (current?.canonical) {
      await clearCanonicalRuntime(current.id);
      await repository.setActiveSession(null);
      await chrome.action.setBadgeText({ text: "" });
    }
    return null;
  }
  if (canonical.ownerUserId !== userId) throw new Error("현재 로그인 사용자에게 속한 집중 세션이 아닙니다.");
  if (scheduleId && canonical.scheduleId !== scheduleId) throw new Error("요청한 집중 계획과 서버 세션이 일치하지 않습니다.");
  const plan = await fetchPlan(canonical.scheduleId, userId);
  await applyCanonicalState(plan, canonical);
  return canonical;
}

export async function activateCanonicalFocus(scheduleId: string, sessionId: string): Promise<void> {
  await reconcileCanonicalFocus(scheduleId, sessionId);
}

export async function resyncCanonicalFocus(): Promise<void> {
  const active = await repository.getActiveSession();
  await reconcileCanonicalFocus(active?.canonical ? active.scheduleId : undefined, active?.canonical ? active.id : undefined);
}

async function transitionCanonical(name: "pause_focus_session" | "resume_focus_session", sessionId: string): Promise<void> {
  const deviceId = await getOrCreateDeviceId();
  const local = await repository.getActiveSession();
  if (local?.canonical && local.id === sessionId) await syncCanonicalMetricsBestEffort(local, deviceId);
  await callSessionRpc(name, { p_session_id: sessionId, p_device_id: deviceId });
  await reconcileCanonicalFocus(undefined, sessionId);
}

export function pauseCanonicalFocus(sessionId: string): Promise<void> {
  return transitionCanonical("pause_focus_session", sessionId);
}

export function resumeCanonicalFocus(sessionId: string): Promise<void> {
  return transitionCanonical("resume_focus_session", sessionId);
}

async function queueSettlement(record: PendingCanonicalSettlement): Promise<void> {
  const pending = await repository.getPendingCanonicalSettlements();
  await repository.setPendingCanonicalSettlements([...pending.filter((item) => item.sessionId !== record.sessionId), record]);
}

export async function finishCanonicalFocus(sessionId: string, scheduleId: string, completedGoalIds: string[]): Promise<void> {
  const now = new Date().toISOString();
  const deviceId = await getOrCreateDeviceId();
  const local = await repository.getActiveSession();
  if (local?.canonical && local.id === sessionId) await syncCanonicalMetricsBestEffort(local, deviceId);
  const record: PendingCanonicalSettlement = {
    idempotencyKey: `focus-finish:${sessionId}`,
    sessionId,
    scheduleId,
    completedGoalIds: [...new Set(completedGoalIds)],
    deviceId,
    createdAt: now,
    lastAttemptAt: now,
    attempts: 0,
  };
  await queueSettlement(record);
  try {
    await callSessionRpc("finish_focus_session", {
      p_session_id: record.sessionId,
      p_completed_goal_ids: record.completedGoalIds,
      p_device_id: record.deviceId,
    });
    await reconcileCanonicalFocus(record.scheduleId, record.sessionId);
  } catch {
    await queueSettlement({ ...record, attempts: 1, lastAttemptAt: new Date().toISOString() });
    throw new Error("정산 요청을 로컬에 안전하게 저장했습니다. 연결이 복구되면 자동으로 다시 시도합니다.");
  }
}

export async function retryPendingCanonicalSettlements(): Promise<void> {
  const pending = await repository.getPendingCanonicalSettlements();
  for (const record of pending) {
    try {
      await callSessionRpc("finish_focus_session", {
        p_session_id: record.sessionId,
        p_completed_goal_ids: record.completedGoalIds,
        p_device_id: record.deviceId,
      });
      await reconcileCanonicalFocus(record.scheduleId, record.sessionId);
    } catch {
      const current = await repository.getPendingCanonicalSettlements();
      await repository.setPendingCanonicalSettlements(current.map((item) => item.sessionId === record.sessionId
        ? { ...item, attempts: item.attempts + 1, lastAttemptAt: new Date().toISOString() }
        : item));
    }
  }
}
