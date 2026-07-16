import type { ActivityEvent, DailyReport, FocusSession, Schedule } from "../../shared/types/models";
import { toDateKey } from "../../shared/time/time";

export function calculateAchievementRate(plannedCount: number, completedCount: number): number {
  return plannedCount === 0 ? 0 : Math.round((completedCount / plannedCount) * 100);
}

export function calculateFocusRate(plannedMinutes: number, actualMinutes: number): number {
  return plannedMinutes === 0 ? 0 : Math.min(100, Math.round((actualMinutes / plannedMinutes) * 100));
}

export function createDailyReport(
  dateKey: string,
  schedules: Schedule[],
  sessions: FocusSession[],
  events: ActivityEvent[],
  existing?: DailyReport,
  now = new Date()
): DailyReport {
  const daySchedules = schedules.filter((item) => item.dateKey === dateKey && item.status !== "cancelled");
  const daySessions = sessions.filter((item) => item.dateKey === dateKey);
  const dayEvents = events.filter((item) => toDateKey(item.occurredAt) === dateKey);
  const completedCount = daySchedules.filter((item) => item.status === "completed").length;
  const incompleteCount = daySchedules.filter((item) => item.status === "incomplete").length;
  const plannedFocusMinutes = daySchedules.reduce((sum, item) => sum + item.targetFocusMinutes, 0);
  const actualFocusMinutes = Math.round(daySessions.reduce((sum, item) => sum + item.accumulatedFocusSeconds, 0) / 60);
  const bestSession = [...daySessions].sort((a, b) => b.accumulatedFocusSeconds - a.accumulatedFocusSeconds)[0];
  const bestScheduleTitle = bestSession
    ? daySchedules.find((item) => item.id === bestSession.scheduleId)?.title ?? null
    : null;
  const achievementRate = calculateAchievementRate(daySchedules.length, completedCount);
  const focusRate = calculateFocusRate(plannedFocusMinutes, actualFocusMinutes);
  const summary = achievementRate >= 80
    ? "계획을 안정적으로 실행했어요. 내일도 비슷한 계획 밀도를 유지해 보세요."
    : daySchedules.length === 0
      ? "기록된 일정이 없어요. 내일 할 일 하나부터 가볍게 계획해 보세요."
      : "완료하지 못한 일정은 시간을 줄이거나 더 작은 단위로 나눠 보세요.";
  const iso = now.toISOString();
  return {
    id: existing?.id ?? `report:${dateKey}`,
    dateKey,
    plannedCount: daySchedules.length,
    completedCount,
    incompleteCount,
    achievementRate,
    plannedFocusMinutes,
    actualFocusMinutes,
    focusRate,
    snoozeCount: daySchedules.reduce((sum, item) => sum + item.snoozeCount, 0),
    blockedAttemptCount: dayEvents.filter((item) => item.type === "blocked-attempt").length,
    idleMinutes: Math.round(daySessions.reduce((sum, item) => sum + item.idleSeconds, 0) / 60),
    breakMinutes: Math.round(daySessions.reduce((sum, item) => sum + (item.accumulatedBreakSeconds ?? 0), 0) / 60),
    bestScheduleTitle,
    summary,
    createdAt: existing?.createdAt ?? iso,
    updatedAt: iso
  };
}
