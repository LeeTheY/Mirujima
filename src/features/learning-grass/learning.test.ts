import { describe, expect, it } from "vitest";
import type { DailyReport } from "../../shared/types/models";
import { calculateLearningStreak, learningDayFromReport, learningIntensity, monthDateKeys } from "./learning";

function report(actualFocusMinutes: number, completedCount: number, achievementRate = 75): DailyReport {
  return {
    id: "report:2026-07-16", dateKey: "2026-07-16", plannedCount: 3, completedCount, incompleteCount: 1,
    achievementRate, plannedFocusMinutes: 120, actualFocusMinutes, focusRate: 50, snoozeCount: 0,
    blockedAttemptCount: 0, idleMinutes: 0, bestScheduleTitle: null, summary: "", createdAt: "2026-07-16T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z"
  };
}

describe("learning grass", () => {
  it.each([[0, 0], [1, 1], [29, 1], [30, 2], [59, 2], [60, 3], [119, 3], [120, 4]])("maps score %i to intensity %i", (score, intensity) => {
    expect(learningIntensity(score)).toBe(intensity);
  });

  it("adds ten points per completed schedule", () => {
    expect(learningDayFromReport(report(35, 2))).toMatchObject({ learningScore: 55, intensity: 2, actualFocusMinutes: 35, completedScheduleCount: 2 });
  });

  it("calculates a streak ending today", () => {
    const days = ["2026-07-14", "2026-07-15", "2026-07-16"].map((dateKey) => ({ ...learningDayFromReport(report(20, 1)), dateKey }));
    expect(calculateLearningStreak(days, "2026-07-16")).toBe(3);
    expect(calculateLearningStreak(days, "2026-07-17")).toBe(0);
  });

  it("builds a leap-year month with weekday padding", () => {
    const dates = monthDateKeys(2028, 1);
    expect(dates.filter(Boolean)).toHaveLength(29);
    expect(dates[0]).toBeNull();
    expect(dates[2]).toBe("2028-02-01");
  });
});
