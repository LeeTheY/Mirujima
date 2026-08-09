import { ALARM_PREFIX } from "../shared/constants";
import { dateKeyDaysAgo } from "../shared/time/time";
import { repository } from "../shared/storage/repository";
import { bootstrap } from "./bootstrap";
import { applyBlockingRules } from "./blocking";
import { showNotification, markNotificationHandled } from "./notifications";
import { generateReport } from "./reports";
import { handleMessage, markFocusAwaitingResult, registerMessageHandler, openMainUI } from "./message-handler";
import { registerIdleListener } from "./idle";
import { checkFocusHealth } from "./activity";
import { realtimeOrganizeIfEnabled, recordManualTabMove, recordNewTabMode, safelyOrganizeActiveSession } from "./tab-organizer";
import { cloudSyncService } from "../features/cloud-sync/service";
import { registerExternalMessageHandler } from "../features/web-bridge/external-handler";
import { resyncCanonicalFocus } from "../features/web-bridge/canonical-focus";

registerMessageHandler();
registerExternalMessageHandler();
registerIdleListener();
chrome.tabs.onCreated.addListener((tab) => { if (tab.id !== undefined) void recordNewTabMode(tab.id); });
chrome.tabs.onMoved.addListener((tabId) => { void recordManualTabMove(tabId); });
const tabUpdateTimers = new Map<number, ReturnType<typeof setTimeout>>();
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.groupId !== undefined) void recordManualTabMove(tabId);
  if (changeInfo.status !== "complete" || !changeInfo.url || changeInfo.url === "about:blank") return;
  const previous = tabUpdateTimers.get(tabId);
  if (previous) clearTimeout(previous);
  tabUpdateTimers.set(tabId, setTimeout(() => { tabUpdateTimers.delete(tabId); void realtimeOrganizeIfEnabled(); }, 800));
});

chrome.runtime.onInstalled.addListener(() => { void bootstrap(); });
chrome.runtime.onStartup.addListener(() => { void bootstrap(); });

chrome.alarms.onAlarm.addListener((alarm) => {
  void (async () => {
    if (alarm.name.startsWith(ALARM_PREFIX.schedule)) {
      const id = alarm.name.slice(ALARM_PREFIX.schedule.length);
      const schedule = (await repository.getSchedules()).find((item) => item.id === id);
      if (schedule && (schedule.status === "scheduled" || schedule.status === "snoozed")) {
        const domains = schedule.allowedDomains.map((item) => item.hostname).join(", ") || "사이트 제한 없음";
        await showNotification("schedule-start", id, `“${schedule.title}”를 시작할 시간이에요`, `계획한 사이트: ${domains}`, ["지금 시작", "5분 미루기"]);
      }
    } else if (alarm.name.startsWith(ALARM_PREFIX.focusEnd)) {
      const sessionId = alarm.name.slice(ALARM_PREFIX.focusEnd.length);
      const session = await repository.getActiveSession();
      if (session?.id === sessionId) {
        await markFocusAwaitingResult();
        await showNotification("focus-end", session.id, "집중 시간이 끝났습니다 — 결과를 선택하세요", "타이머와 사이트 차단을 멈췄어요. 완료 또는 미완료를 선택해야 기록이 확정됩니다.", ["완료", "미완료"]);
      }
    } else if (alarm.name.startsWith(ALARM_PREFIX.breakEnd)) {
      const sessionId = alarm.name.slice(ALARM_PREFIX.breakEnd.length);
      const session = await repository.getActiveSession();
      if (session?.id === sessionId && session.status === "paused") {
        await chrome.action.setBadgeBackgroundColor({ color: "#E45A3B" });
        await chrome.action.setBadgeText({ text: "+쉼" });
        await showNotification("break-end", session.id, "설정한 휴식 시간이 끝났습니다", "휴식 시간은 계속 기록되고 있어요. 준비됐다면 지금 집중을 다시 시작하세요.", ["집중 재개", "집중 화면 열기"], { bypassCooldown: true, replaceExisting: true });
      }
    } else if (alarm.name.startsWith(ALARM_PREFIX.temporaryAllow)) {
      const now = Date.now();
      const allows = (await repository.getTemporaryAllows()).filter((item) => item.expiresAt === null || new Date(item.expiresAt).getTime() > now);
      await repository.setTemporaryAllows(allows);
      const session = await repository.getActiveSession();
      const schedule = session ? (await repository.getSchedules()).find((item) => item.id === session.scheduleId) : undefined;
      if (session && schedule && session.status === "active") await applyBlockingRules(schedule, session, allows);
    } else if (alarm.name === ALARM_PREFIX.focusCheck) {
      await checkFocusHealth();
    } else if (alarm.name === ALARM_PREFIX.dailyReport) {
      await generateReport(dateKeyDaysAgo(1));
    } else if (alarm.name === ALARM_PREFIX.cloudSync) {
      try { await cloudSyncService.sync(); } catch (error) { console.warn("예약 cloud 동기화를 건너뛰었습니다.", error); }
    } else if (alarm.name === ALARM_PREFIX.canonicalFocusSync) {
      try { await resyncCanonicalFocus(); } catch (error) { console.warn("웹 집중 세션 재동기화를 건너뛰었습니다.", error); }
    }
  })();
});

chrome.notifications.onClicked.addListener(() => {
  void openMainUI();
});

chrome.notifications.onButtonClicked.addListener((id, buttonIndex) => {
  void (async () => {
    await markNotificationHandled(id);
    if (id.startsWith("tab-organize-confirm:") && buttonIndex <= 1) {
      if (buttonIndex === 0) await safelyOrganizeActiveSession("focus-start");
      return;
    }
    if (id.startsWith("schedule-start:") && buttonIndex === 0) {
      const scheduleId = id.slice("schedule-start:".length);
      const started = await handleMessage({ type: "FOCUS_START", scheduleId, organizeTabs: false });
      if (started.tabOrganizerSettings.enabled && started.tabOrganizerSettings.organizeOnFocusStart) {
        await showNotification(
          "tab-organize-confirm",
          scheduleId,
          "현재 창의 탭을 그룹화할까요?",
          "그대로 유지를 선택해도 집중 일정은 계속 진행됩니다.",
          ["탭 그룹화", "그대로 유지"],
          { bypassCooldown: true, replaceExisting: true }
        );
      }
      return;
    }
    if (id.startsWith("schedule-start:") && buttonIndex === 1) {
      const scheduleId = id.slice("schedule-start:".length);
      await handleMessage({ type: "SCHEDULE_SNOOZE", scheduleId, minutes: 5 });
      return;
    }
    if (id.startsWith("focus-end:") && buttonIndex <= 1) {
      const sessionId = id.slice("focus-end:".length);
      const result = buttonIndex === 0 ? "completed" : "incomplete";
      await showNotification(
        "finish-confirm",
        `${result}:${sessionId}`,
        result === "completed" ? "정말 완료로 기록할까요?" : "정말 미완료로 기록할까요?",
        "확정을 누르면 오늘 기록과 리포트에 바로 반영됩니다.",
        ["확정", "돌아가기"],
        { bypassCooldown: true, replaceExisting: true }
      );
      return;
    }
    if (id.startsWith("finish-confirm:") && buttonIndex === 0) {
      const value = id.slice("finish-confirm:".length);
      const result = value.startsWith("completed:") ? "completed" : "incomplete";
      await handleMessage({ type: "FOCUS_FINISH", result });
      return;
    }
    if (id.startsWith("break-end:") && buttonIndex === 0) {
      await handleMessage({ type: "FOCUS_RESUME" });
      return;
    }
    if (id.startsWith("idle-check:") && buttonIndex === 1) {
      const session = await repository.getActiveSession();
      if (session?.status === "active") await handleMessage({ type: "FOCUS_PAUSE" });
      return;
    }
    await openMainUI();
  })();
});

void bootstrap();
void chrome.alarms.create(ALARM_PREFIX.canonicalFocusSync, { periodInMinutes: 1 });
