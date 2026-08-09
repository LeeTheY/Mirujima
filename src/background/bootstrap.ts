import { ensureDailyReportAlarm, ensureFocusCheckAlarm, setBreakEndAlarm, setFocusEndAlarm, syncScheduleAlarms } from "./alarms";
import { applyBlockingRules, clearBlockingRules } from "./blocking";
import { generateMissedReports } from "./reports";
import { repository } from "../shared/storage/repository";
import { syncMainUI } from "./ui";
import { elapsedFocusSeconds } from "../shared/time/time";
import { markFocusAwaitingResult } from "./message-handler";
import { membershipService } from "../features/membership/service";
import { cloudSyncService } from "../features/cloud-sync/service";
import { ALARM_PREFIX } from "../shared/constants";

export async function bootstrap(): Promise<void> {
  await repository.initialize();
  try { await membershipService.restore(); } catch (error) { console.warn("멤버십 복구를 건너뛰었습니다.", error); }
  const snapshot = await repository.getSnapshot();
  await syncMainUI(snapshot.settings.mainUI);
  await syncScheduleAlarms(snapshot.schedules);
  await ensureDailyReportAlarm();
  const session = snapshot.activeSession;
  const schedule = session ? snapshot.schedules.find((item) => item.id === session.scheduleId) : undefined;
  if (session && schedule && session.status === "active") {
    const elapsed = elapsedFocusSeconds(session.startedAt, null, session.accumulatedFocusSeconds);
    const remainingSeconds = session.endsAt
      ? Math.max(0, Math.floor((new Date(session.endsAt).getTime() - Date.now()) / 1000))
      : schedule.targetFocusMinutes * 60 - elapsed;
    if (remainingSeconds <= 0) {
      await markFocusAwaitingResult();
    } else {
      await applyBlockingRules(schedule, session, snapshot.temporaryAllows);
      await chrome.action.setBadgeBackgroundColor({ color: "#315A4A" });
      await chrome.action.setBadgeText({ text: "ON" });
      await ensureFocusCheckAlarm(true);
      await setFocusEndAlarm(session.id, session.endsAt ?? new Date(Date.now() + remainingSeconds * 1000).toISOString());
    }
  } else if (session?.status === "awaiting-result") {
    await clearBlockingRules();
    await ensureFocusCheckAlarm(false);
    await chrome.action.setBadgeBackgroundColor({ color: "#E45A3B" });
    await chrome.action.setBadgeText({ text: "확인" });
  } else if (session?.status === "paused" && session.breakStartedAt && session.breakEndsAt) {
    await clearBlockingRules();
    await ensureFocusCheckAlarm(false);
    if (new Date(session.breakEndsAt).getTime() > Date.now()) {
      await setBreakEndAlarm(session.id, session.breakEndsAt);
      await chrome.action.setBadgeText({ text: "쉼" });
    } else {
      await chrome.action.setBadgeBackgroundColor({ color: "#E45A3B" });
      await chrome.action.setBadgeText({ text: "+쉼" });
    }
  } else {
    await clearBlockingRules();
    await ensureFocusCheckAlarm(false);
  }
  await chrome.idle.setDetectionInterval(snapshot.settings.idleThresholdMinutes * 60);
  await generateMissedReports();
  if (snapshot.membership.status === "active" && snapshot.membership.entitlements.includes("cloud-sync")) {
    await chrome.alarms.create(ALARM_PREFIX.cloudSync, { periodInMinutes: 15 });
    void cloudSyncService.sync().catch((error) => console.warn("자동 cloud 동기화를 건너뛰었습니다.", error));
  } else {
    await chrome.alarms.clear(ALARM_PREFIX.cloudSync);
  }
}
