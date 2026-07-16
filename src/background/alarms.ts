import { ALARM_PREFIX } from "../shared/constants";
import { startOfNextDay } from "../shared/time/time";
import type { Schedule, TemporaryAllow } from "../shared/types/models";

export async function syncScheduleAlarms(schedules: Schedule[]): Promise<void> {
  const existing = await chrome.alarms.getAll();
  const validNames = new Set(schedules
    .filter((item) => item.status === "scheduled" || item.status === "snoozed")
    .map((item) => `${ALARM_PREFIX.schedule}${item.id}`));
  await Promise.all(existing
    .filter((alarm) => alarm.name.startsWith(ALARM_PREFIX.schedule) && !validNames.has(alarm.name))
    .map((alarm) => chrome.alarms.clear(alarm.name)));
  await Promise.all(schedules
    .filter((item) => item.status === "scheduled" || item.status === "snoozed")
    .map((item) => chrome.alarms.create(`${ALARM_PREFIX.schedule}${item.id}`, {
      when: new Date(item.snoozedUntil ?? item.startAt).getTime()
    })));
}

export async function setFocusEndAlarm(sessionId: string, endAt: string): Promise<void> {
  await chrome.alarms.create(`${ALARM_PREFIX.focusEnd}${sessionId}`, { when: new Date(endAt).getTime() });
}

export async function clearFocusEndAlarm(sessionId: string): Promise<void> {
  await chrome.alarms.clear(`${ALARM_PREFIX.focusEnd}${sessionId}`);
}

export async function setBreakEndAlarm(sessionId: string, endAt: string): Promise<void> {
  await chrome.alarms.create(`${ALARM_PREFIX.breakEnd}${sessionId}`, { when: new Date(endAt).getTime() });
}

export async function clearBreakEndAlarm(sessionId: string): Promise<void> {
  await chrome.alarms.clear(`${ALARM_PREFIX.breakEnd}${sessionId}`);
}

export async function ensureFocusCheckAlarm(active: boolean): Promise<void> {
  if (active) await chrome.alarms.create(ALARM_PREFIX.focusCheck, { delayInMinutes: 1, periodInMinutes: 1 });
  else await chrome.alarms.clear(ALARM_PREFIX.focusCheck);
}

export async function setTemporaryAllowAlarm(allow: TemporaryAllow): Promise<void> {
  if (allow.expiresAt) {
    await chrome.alarms.create(`${ALARM_PREFIX.temporaryAllow}${allow.sessionId}:${allow.hostname}`, {
      when: new Date(allow.expiresAt).getTime()
    });
  }
}

export async function ensureDailyReportAlarm(): Promise<void> {
  await chrome.alarms.create(ALARM_PREFIX.dailyReport, {
    when: startOfNextDay().getTime(),
    periodInMinutes: 24 * 60
  });
}
