import { describe, expect, it } from "vitest";
import { calculateAchievementRate, calculateFocusRate, createDailyReport } from "./report";
import type { FocusSession, Schedule } from "../../shared/types/models";

const schedule: Schedule = { id: "a", title: "작업", description: "", dateKey: "2026-07-14", startAt: "2026-07-14T01:00:00Z", endAt: "2026-07-14T02:00:00Z", targetFocusMinutes: 60, activityMode: "interactive", blockingMode: "off", allowedDomains: [], blockedDomains: [], breakMinutes: 10, status: "completed", snoozeCount: 3, createdAt: "2026-07-14T00:00:00Z", updatedAt: "2026-07-14T02:00:00Z" };
const session: FocusSession = { id: "s", scheduleId: "a", dateKey: "2026-07-14", startedAt: schedule.startAt, endedAt: schedule.endAt, pausedAt: null, accumulatedFocusSeconds: 3600, accumulatedBreakSeconds: 750, distractionSeconds: 0, idleSeconds: 120, blockedAttemptCount: 1, checkInCount: 0, status: "completed" };

describe("리포트", () => {
  it("달성률을 계산하고 100으로 제한한다", () => { expect(calculateAchievementRate(4, 3)).toBe(75); expect(calculateFocusRate(10, 20)).toBe(100); });
  it("동일 날짜 리포트를 idempotent하게 갱신한다", () => {
    const first = createDailyReport("2026-07-14", [schedule], [session], []);
    const second = createDailyReport("2026-07-14", [schedule], [session], [], first);
    expect(second.id).toBe(first.id);
    expect(second.snoozeCount).toBe(3);
    expect(second.idleMinutes).toBe(2);
    expect(second.breakMinutes).toBe(13);
  });
});
