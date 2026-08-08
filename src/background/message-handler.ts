import { clearBreakEndAlarm, clearFocusEndAlarm, ensureFocusCheckAlarm, setBreakEndAlarm, setFocusEndAlarm, setTemporaryAllowAlarm, syncScheduleAlarms } from "./alarms";
import { applyBlockingRules, clearBlockingRules } from "./blocking";
import { markNotificationHandled, showNotification, showTestNotification } from "./notifications";
import { generateReport } from "./reports";
import { normalizeHostname } from "../features/blocking/domain";
import { repository } from "../shared/storage/repository";
import { elapsedBreakSeconds, elapsedFocusSeconds, getBreakTimeState, hasOverlap } from "../shared/time/time";
import type { ExtensionMessage, MessageResponse } from "../shared/types/messages";
import type { AppSnapshot, FocusSession, Schedule, TemporaryAllow } from "../shared/types/models";
import { createId } from "../shared/utils/id";
import { syncMainUI } from "./ui";
import { finalizeTabSnapshot, organizeActiveSession, rememberClassification, restoreTabLayout, safelyOrganizeActiveSession, saveCurrentWorkTabSet, setBreakGroupExpanded } from "./tab-organizer";
import { tabOrganizerRepository } from "../features/tab-organizer/repository";
import { membershipService } from "../features/membership/service";
import { cloudSyncService } from "../features/cloud-sync/service";
import { ALARM_PREFIX } from "../shared/constants";
import { applyWritingToTab, captureWritingArea } from "./writing-capture";

export function isStrongSnoozeWarning(snoozeCount: number): boolean {
  return snoozeCount >= 3;
}

async function snapshot(): Promise<AppSnapshot> {
  return repository.getSnapshot();
}

function validateSchedule(schedule: Schedule, existing: Schedule[]): void {
  if (!schedule.title.trim()) throw new Error("일정명을 입력해 주세요.");
  const start = new Date(schedule.startAt).getTime();
  const end = new Date(schedule.endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("종료 시각은 시작 시각보다 늦어야 합니다.");
  if (schedule.targetFocusMinutes <= 0) throw new Error("목표 집중 시간은 1분 이상이어야 합니다.");
  if (schedule.breakMinutes <= 0) throw new Error("권장 휴식 시간은 1분 이상이어야 합니다.");
  const overlap = existing.find((item) => item.id !== schedule.id && item.dateKey === schedule.dateKey
    && item.status !== "cancelled" && hasOverlap(schedule.startAt, schedule.endAt, item.startAt, item.endAt));
  if (overlap) throw new Error(`“${overlap.title}” 일정과 시간이 겹칩니다.`);
}

async function saveSchedules(schedules: Schedule[]): Promise<void> {
  await repository.setSchedules(schedules.sort((a, b) => a.startAt.localeCompare(b.startAt)));
  await syncScheduleAlarms(schedules);
}

async function startFocus(scheduleId: string, organizeTabs = false): Promise<void> {
  const [schedules, activeSession, temporaryAllows] = await Promise.all([
    repository.getSchedules(), repository.getActiveSession(), repository.getTemporaryAllows()
  ]);
  if (activeSession) throw new Error("이미 진행 중인 집중 세션이 있습니다.");
  const schedule = schedules.find((item) => item.id === scheduleId);
  if (!schedule) throw new Error("일정을 찾을 수 없습니다.");
  const now = new Date().toISOString();
  const session: FocusSession = {
    id: createId("session"), scheduleId, dateKey: schedule.dateKey, startedAt: now,
    endedAt: null, pausedAt: null, accumulatedFocusSeconds: 0, distractionSeconds: 0,
    idleSeconds: 0, blockedAttemptCount: 0, checkInCount: 0, status: "active",
    breakEndsAt: null, breakStartedAt: null, accumulatedBreakSeconds: 0
  };
  await repository.setActiveSession(session);
  await repository.setSchedules(schedules.map((item) => item.id === scheduleId
    ? { ...item, status: "focusing", updatedAt: now } : item));
  await applyBlockingRules(schedule, session, temporaryAllows);
  await setFocusEndAlarm(session.id, new Date(Date.now() + schedule.targetFocusMinutes * 60_000).toISOString());
  await ensureFocusCheckAlarm(true);
  await chrome.action.setBadgeBackgroundColor({ color: "#315A4A" });
  await chrome.action.setBadgeText({ text: "ON" });
  if (organizeTabs) await safelyOrganizeActiveSession("focus-start");
}

async function pauseFocus(): Promise<void> {
  const session = await repository.getActiveSession();
  if (!session || session.status !== "active") throw new Error("진행 중인 집중 세션이 없습니다.");
  const now = new Date().toISOString();
  await repository.setActiveSession({
    ...session, status: "paused", pausedAt: now,
    accumulatedFocusSeconds: elapsedFocusSeconds(session.startedAt, null, session.accumulatedFocusSeconds),
    breakEndsAt: null, breakStartedAt: null
  });
  const schedules = await repository.getSchedules();
  await repository.setSchedules(schedules.map((item) => item.id === session.scheduleId
    ? { ...item, status: "paused", updatedAt: now } : item));
  await clearBlockingRules();
  await ensureFocusCheckAlarm(false);
  await clearFocusEndAlarm(session.id);
  await chrome.action.setBadgeText({ text: "Ⅱ" });
}

async function resumeFocus(): Promise<void> {
  const session = await repository.getActiveSession();
  if (!session || session.status !== "paused") throw new Error("일시정지된 집중 세션이 없습니다.");
  const schedules = await repository.getSchedules();
  const schedule = schedules.find((item) => item.id === session.scheduleId);
  if (!schedule) throw new Error("일정을 찾을 수 없습니다.");
  const resumedAt = new Date();
  const currentBreakSeconds = session.breakStartedAt
    ? Math.max(0, Math.floor((resumedAt.getTime() - new Date(session.breakStartedAt).getTime()) / 1000))
    : 0;
  const resumed = {
    ...session,
    status: "active" as const,
    pausedAt: null,
    breakEndsAt: null,
    breakStartedAt: null,
    accumulatedBreakSeconds: elapsedBreakSeconds(session.breakStartedAt, session.accumulatedBreakSeconds, resumedAt.getTime()),
    startedAt: resumedAt.toISOString()
  };
  await repository.setActiveSession(resumed);
  if (session.breakStartedAt) await repository.appendEvent({
    id: createId("event"), scheduleId: session.scheduleId, sessionId: session.id,
    type: "break-end", occurredAt: resumedAt.toISOString(), metadata: { seconds: currentBreakSeconds }
  });
  await repository.setSchedules(schedules.map((item) => item.id === session.scheduleId
    ? { ...item, status: "focusing", updatedAt: resumed.startedAt } : item));
  await applyBlockingRules(schedule, resumed, await repository.getTemporaryAllows());
  await ensureFocusCheckAlarm(true);
  await clearBreakEndAlarm(session.id);
  const remainingSeconds = Math.max(1, schedule.targetFocusMinutes * 60 - resumed.accumulatedFocusSeconds);
  await setFocusEndAlarm(session.id, new Date(resumedAt.getTime() + remainingSeconds * 1000).toISOString());
  await chrome.action.setBadgeText({ text: "ON" });
  await safelyOrganizeActiveSession("focus-resume");
}

async function startBreak(): Promise<void> {
  const session = await repository.getActiveSession();
  if (!session || session.status !== "active") throw new Error("진행 중인 집중 세션이 없습니다.");
  const schedules = await repository.getSchedules();
  const schedule = schedules.find((item) => item.id === session.scheduleId);
  if (!schedule) throw new Error("일정을 찾을 수 없습니다.");
  if (schedule.breakMinutes <= 0) throw new Error("일정에서 권장 휴식 시간을 먼저 설정해 주세요.");
  const now = new Date();
  const accumulatedBreakSeconds = session.accumulatedBreakSeconds ?? 0;
  const { remaining: remainingBreakSeconds } = getBreakTimeState(schedule.breakMinutes * 60, accumulatedBreakSeconds);
  const breakEndsAt = new Date(now.getTime() + remainingBreakSeconds * 1000).toISOString();
  await repository.setActiveSession({
    ...session,
    status: "paused",
    pausedAt: now.toISOString(),
    accumulatedFocusSeconds: elapsedFocusSeconds(session.startedAt, null, session.accumulatedFocusSeconds),
    breakEndsAt,
    breakStartedAt: now.toISOString(),
    accumulatedBreakSeconds
  });
  await repository.appendEvent({
    id: createId("event"), scheduleId: session.scheduleId, sessionId: session.id,
    type: "break-start", occurredAt: now.toISOString(), metadata: { plannedMinutes: schedule.breakMinutes }
  });
  await repository.setSchedules(schedules.map((item) => item.id === session.scheduleId
    ? { ...item, status: "paused", updatedAt: now.toISOString() } : item));
  await clearBlockingRules();
  await ensureFocusCheckAlarm(false);
  await clearFocusEndAlarm(session.id);
  if (remainingBreakSeconds > 0) {
    await setBreakEndAlarm(session.id, breakEndsAt);
    await chrome.action.setBadgeText({ text: "쉼" });
  } else {
    await chrome.action.setBadgeBackgroundColor({ color: "#E45A3B" });
    await chrome.action.setBadgeText({ text: "+쉼" });
  }
  try {
    const settings = await tabOrganizerRepository.getSettings();
    if (settings.enabled && settings.expandBreakGroupOnBreak) await setBreakGroupExpanded(true);
  } catch (error) { console.warn("휴식 탭 그룹을 펼치지 못했습니다.", error); }
}

export async function markFocusAwaitingResult(): Promise<void> {
  const session = await repository.getActiveSession();
  if (!session || session.status === "awaiting-result") return;
  if (session.status !== "active" && session.status !== "paused") return;
  const schedules = await repository.getSchedules();
  const schedule = schedules.find((item) => item.id === session.scheduleId);
  if (!schedule) return;
  const targetSeconds = schedule.targetFocusMinutes * 60;
  const elapsed = session.status === "active"
    ? elapsedFocusSeconds(session.startedAt, null, session.accumulatedFocusSeconds)
    : session.accumulatedFocusSeconds;
  const now = new Date().toISOString();
  await repository.setActiveSession({
    ...session,
    status: "awaiting-result",
    pausedAt: now,
    breakEndsAt: null,
    breakStartedAt: null,
    accumulatedBreakSeconds: elapsedBreakSeconds(session.breakStartedAt, session.accumulatedBreakSeconds),
    accumulatedFocusSeconds: Math.min(targetSeconds, elapsed)
  });
  await clearBlockingRules();
  await ensureFocusCheckAlarm(false);
  await clearFocusEndAlarm(session.id);
  await clearBreakEndAlarm(session.id);
  await chrome.action.setBadgeBackgroundColor({ color: "#E45A3B" });
  await chrome.action.setBadgeText({ text: "확인" });
}

async function finishFocus(result: "completed" | "incomplete"): Promise<void> {
  const session = await repository.getActiveSession();
  if (!session) throw new Error("진행 중인 집중 세션이 없습니다.");
  const endedAt = new Date().toISOString();
  const currentBreakSeconds = session.breakStartedAt
    ? Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(session.breakStartedAt).getTime()) / 1000))
    : 0;
  const finished: FocusSession = {
    ...session,
    endedAt,
    status: "completed",
    pausedAt: null,
    breakStartedAt: null,
    breakEndsAt: null,
    accumulatedBreakSeconds: elapsedBreakSeconds(session.breakStartedAt, session.accumulatedBreakSeconds, new Date(endedAt).getTime()),
    accumulatedFocusSeconds: session.status === "active"
      ? elapsedFocusSeconds(session.startedAt, null, session.accumulatedFocusSeconds)
      : session.accumulatedFocusSeconds
  };
  if (session.breakStartedAt) await repository.appendEvent({
    id: createId("event"), scheduleId: session.scheduleId, sessionId: session.id,
    type: "break-end", occurredAt: endedAt, metadata: { seconds: currentBreakSeconds, endedWithSession: true }
  });
  const history = await repository.getSessionHistory();
  await repository.setSessionHistory([...history, finished]);
  await repository.setActiveSession(null);
  await repository.setTemporaryAllows((await repository.getTemporaryAllows()).filter((item) => item.sessionId !== session.id));
  const schedules = await repository.getSchedules();
  await repository.setSchedules(schedules.map((item) => item.id === session.scheduleId
    ? { ...item, status: result, updatedAt: endedAt } : item));
  await clearBlockingRules();
  await ensureFocusCheckAlarm(false);
  await clearFocusEndAlarm(session.id);
  await clearBreakEndAlarm(session.id);
  await chrome.action.setBadgeText({ text: "" });
  await markNotificationHandled(`focus-end:${session.id}`);
  await generateReport(session.dateKey);
  try {
    if ((await tabOrganizerRepository.getSettings()).restoreLayoutOnFinish === "always") await restoreTabLayout(session.id);
  } catch (error) { console.warn("집중 종료 후 탭 배치를 복원하지 못했습니다.", error); }
  try { await finalizeTabSnapshot(session.id); } catch (error) { console.warn("완료된 탭 snapshot을 정리하지 못했습니다.", error); }
}

async function snoozeSchedule(scheduleId: string, minutes: number): Promise<void> {
  const schedules = await repository.getSchedules();
  const schedule = schedules.find((item) => item.id === scheduleId);
  if (!schedule) throw new Error("일정을 찾을 수 없습니다.");
  const now = new Date();
  const until = new Date(now.getTime() + minutes * 60_000).toISOString();
  await saveSchedules(schedules.map((item) => item.id === scheduleId ? {
    ...item, status: "snoozed", snoozeCount: item.snoozeCount + 1, snoozedUntil: until, updatedAt: now.toISOString()
  } : item));
  await repository.appendEvent({
    id: createId("event"), scheduleId, sessionId: "not-started", type: "snooze",
    occurredAt: now.toISOString(), metadata: { minutes }
  });
  if (isStrongSnoozeWarning(schedule.snoozeCount + 1)) {
    await showNotification("snooze-warning", scheduleId, "미루기가 반복되고 있어요", `${schedule.snoozeCount + 1}번째 미루기예요. 일정을 더 작게 나눠볼까요?`);
  }
}

async function addTemporaryAllow(hostnameInput: string, minutes: number, reason: string): Promise<void> {
  const session = await repository.getActiveSession();
  if (!session || session.status !== "active") throw new Error("진행 중인 세션이 없습니다.");
  const hostname = normalizeHostname(hostnameInput);
  const allow: TemporaryAllow = {
    hostname, sessionId: session.id, reason: reason.trim() || "긴급 작업",
    expiresAt: minutes === 0 ? null : new Date(Date.now() + minutes * 60_000).toISOString()
  };
  const allows = await repository.getTemporaryAllows();
  await repository.setTemporaryAllows([...allows.filter((item) => !(item.sessionId === session.id && item.hostname === hostname)), allow]);
  await repository.appendEvent({
    id: createId("event"), scheduleId: session.scheduleId, sessionId: session.id,
    type: "temporary-allow", hostname, occurredAt: new Date().toISOString(), metadata: { reason: allow.reason, minutes }
  });
  const schedules = await repository.getSchedules();
  const schedule = schedules.find((item) => item.id === session.scheduleId);
  if (schedule && session.status === "active") await applyBlockingRules(schedule, session, [...allows, allow]);
  await setTemporaryAllowAlarm(allow);
}

async function recordBlockedAttempt(hostnameInput: string): Promise<void> {
  const session = await repository.getActiveSession();
  if (!session || session.status !== "active") return;
  const hostname = normalizeHostname(hostnameInput);
  const updated = { ...session, blockedAttemptCount: session.blockedAttemptCount + 1 };
  await repository.setActiveSession(updated);
  await repository.appendEvent({
    id: createId("event"), scheduleId: session.scheduleId, sessionId: session.id,
    type: "blocked-attempt", hostname, occurredAt: new Date().toISOString()
  });
  if (updated.blockedAttemptCount >= 2) {
    await showNotification("distraction-detected", session.id, "방해 사이트 접근이 반복되고 있습니다", "차단된 사이트를 다시 열려고 했어요. 계획한 작업으로 지금 돌아가세요.", ["계속 집중", "집중 화면 열기"]);
  }
}

export async function handleMessage(message: ExtensionMessage): Promise<AppSnapshot> {
  switch (message.type) {
    case "APP_BOOTSTRAP": return snapshot();
    case "SCHEDULE_CREATE": {
      const schedules = await repository.getSchedules();
      validateSchedule(message.payload, schedules);
      await saveSchedules([...schedules, message.payload]);
      break;
    }
    case "SCHEDULE_UPDATE": {
      const schedules = await repository.getSchedules();
      validateSchedule(message.payload, schedules);
      await saveSchedules(schedules.map((item) => item.id === message.payload.id ? message.payload : item));
      break;
    }
    case "SCHEDULE_DELETE": {
      const session = await repository.getActiveSession();
      if (session?.scheduleId === message.scheduleId) throw new Error("진행 중인 일정은 삭제할 수 없습니다.");
      await saveSchedules((await repository.getSchedules()).filter((item) => item.id !== message.scheduleId));
      break;
    }
    case "SCHEDULE_SNOOZE": await snoozeSchedule(message.scheduleId, message.minutes); break;
    case "FOCUS_START": await startFocus(message.scheduleId, message.organizeTabs); break;
    case "FOCUS_PAUSE": await pauseFocus(); break;
    case "FOCUS_RESUME": await resumeFocus(); break;
    case "FOCUS_BREAK": await startBreak(); break;
    case "FOCUS_FINISH": await finishFocus(message.result); break;
    case "BLOCKED_ATTEMPT": await recordBlockedAttempt(message.hostname); break;
    case "TEMPORARY_ALLOW": await addTemporaryAllow(message.hostname, message.minutes, message.reason); break;
    case "ACTIVITY_HEARTBEAT": {
      const session = await repository.getActiveSession();
      const settings = await repository.getSettings();
      if (session?.status === "active" && settings.activityHeartbeatEnabled) await repository.appendEvent({
        id: createId("event"), scheduleId: session.scheduleId, sessionId: session.id,
        type: "heartbeat", occurredAt: message.occurredAt, metadata: { visible: message.visible }
      });
      break;
    }
    case "IDLE_ACTION":
      if (message.action === "pause") await pauseFocus();
      break;
    case "OPEN_MAIN_UI": await openMainUI(message.target); break;
    case "GENERATE_DAILY_REPORT": await generateReport(message.dateKey); break;
    case "SETTINGS_UPDATE":
      await repository.setSettings(message.payload);
      await chrome.idle.setDetectionInterval(message.payload.idleThresholdMinutes * 60);
      await syncMainUI(message.payload.mainUI);
      break;
    case "TAB_ORGANIZER_SETTINGS_UPDATE":
      await tabOrganizerRepository.setSettings(message.payload);
      break;
    case "MEMBERSHIP_CHECK_ACCOUNT": await membershipService.checkChromeAccount(); break;
    case "MEMBERSHIP_SIGN_IN": await membershipService.signIn(); break;
    case "MEMBERSHIP_OPEN_CHECKOUT": await membershipService.openCheckout(); break;
    case "MEMBERSHIP_RESTORE": await membershipService.restore(); break;
    case "MEMBERSHIP_SIGN_OUT":
      await membershipService.signOut();
      await chrome.alarms.clear(ALARM_PREFIX.cloudSync);
      break;
    case "CLOUD_INITIAL_BACKUP": await cloudSyncService.initialBackup(); break;
    case "CLOUD_RESTORE_PREVIEW": await cloudSyncService.previewRestore(); break;
    case "CLOUD_RESTORE_CONFIRM": await cloudSyncService.confirmRestore(); break;
    case "CLOUD_SYNC_NOW": await cloudSyncService.sync(); break;
    case "CLOUD_CONFLICT_RESOLVE": await cloudSyncService.resolveConflict(message.entityType, message.entityId, message.resolution); break;
    case "NOTIFICATION_TEST":
      await showTestNotification();
      break;
    case "NOTIFICATION_HANDLE":
      await markNotificationHandled(message.notificationId);
      break;
    case "CLEAR_DATA": await repository.clearAll(); break;
    case "EXPORT_DATA": break;
    case "TAB_ORGANIZE":
    case "TAB_LAYOUT_RESTORE":
    case "TAB_CLASSIFICATION_UPDATE":
    case "WORK_TAB_SET_SAVE":
      break;
  }
  return snapshot();
}

export async function openMainUI(target?: "sidepanel" | "popup"): Promise<void> {
  const settings = await repository.getSettings();
  if ((target ?? settings.mainUI) === "sidepanel") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId !== undefined) {
      try { await chrome.sidePanel.open({ windowId: tab.windowId }); return; } catch { /* fallback below */ }
    }
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
}

export function registerMessageHandler(): void {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse: (response: MessageResponse<unknown>) => void) => {
    if (message.type === "EXPORT_DATA") {
      void repository.exportAll()
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "내보내지 못했습니다." }));
      return true;
    }
    if (message.type === "TAB_ORGANIZE") {
      void organizeActiveSession("manual")
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "탭을 정리하지 못했습니다." }));
      return true;
    }
    if (message.type === "TAB_LAYOUT_RESTORE") {
      void restoreTabLayout(message.sessionId)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "탭 배치를 복원하지 못했습니다." }));
      return true;
    }
    if (message.type === "TAB_CLASSIFICATION_UPDATE") {
      void rememberClassification(message.tabId, message.category, message.remember)
        .then(() => sendResponse({ ok: true, data: {} }))
        .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "분류를 기억하지 못했습니다." }));
      return true;
    }
    if (message.type === "WORK_TAB_SET_SAVE") {
      void saveCurrentWorkTabSet(message.name, message.scheduleId)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "작업 탭 세트를 저장하지 못했습니다." }));
      return true;
    }
    if (message.type === "AI_SCREEN_SELECT") {
      void captureWritingArea()
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "화면을 캡처하지 못했습니다." }));
      return true;
    }
    if (message.type === "AI_APPLY_TEXT") {
      void applyWritingToTab(message.tabId, message.text)
        .then(() => sendResponse({ ok: true, data: { applied: true } }))
        .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "입력창에 적용하지 못했습니다." }));
      return true;
    }
    void handleMessage(message)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "알 수 없는 오류" }));
    return true;
  });
}
