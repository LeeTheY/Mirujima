import { describe, expect, it } from "vitest";
import { guardianFocusHistorySchema, historyPeriodSchema, studentFocusHistorySchema } from "./index";

const range = { startDate: "2026-08-24", endDate: "2026-08-24" };

describe("focus history contracts", () => {
  it("accepts only supported history periods", () => {
    expect(historyPeriodSchema.safeParse("daily").success).toBe(true);
    expect(historyPeriodSchema.safeParse("yearly").success).toBe(false);
  });

  it("parses student history with terminal session details", () => {
    const parsed = studentFocusHistorySchema.parse({
      period: "daily",
      range,
      summary: {
        completionRate: 80,
        totalFocusMinutes: 25,
        successfulSessionCount: 1,
        failedSessionCount: 0,
        completedGoalCount: 1,
        totalGoalCount: 2,
        focusStreakDays: 2,
        earnedPoints: 800,
        returnedPoints: 200,
        blockedAttemptCount: 3,
      },
      trend: [{ dateKey: "2026-08-24", focusMinutes: 25, successfulSessionCount: 1, failedSessionCount: 0, completionRate: 80 }],
      sessionCount: 1,
      sessionsTruncated: false,
      sessions: [{
        sessionId: "session-1",
        scheduleId: "schedule-1",
        dateKey: "2026-08-24",
        startedAt: "2026-08-24T10:00:00.000Z",
        settledAt: "2026-08-24T10:25:00.000Z",
        status: "success",
        focusMinutes: 25,
        targetFocusMinutes: 25,
        completionPercent: 80,
        completedGoalCount: 1,
        totalGoalCount: 2,
        earnedPoints: 800,
        returnedPoints: 200,
        blockedAttemptCount: 3,
        goals: [{ goalId: "goal-1", name: "수학", minutes: 25, priority: "high", completed: true }],
      }],
    });
    expect(parsed.sessions[0]?.goals[0]?.completed).toBe(true);
  });

  it("distinguishes private guardian fields from real zero values", () => {
    const parsed = guardianFocusHistorySchema.parse({
      student: { userId: "11111111-1111-4111-8111-111111111111", displayName: "학생" },
      period: "daily",
      range,
      sharing: { completion: false, totalFocusMinutes: true, rewardStatus: false },
      summary: { completionRate: null, totalFocusMinutes: 0, completedGoalCount: null, rewardCount: null },
      trend: [{ dateKey: "2026-08-24", completionRate: null, focusMinutes: 0 }],
    });
    expect(parsed.summary.completionRate).toBeNull();
    expect(parsed.summary.totalFocusMinutes).toBe(0);
  });

  it("rejects raw fields on malformed numeric history values", () => {
    const result = guardianFocusHistorySchema.safeParse({
      student: { userId: "11111111-1111-4111-8111-111111111111", displayName: "학생" },
      period: "daily",
      range,
      sharing: { completion: true, totalFocusMinutes: true, rewardStatus: true },
      summary: { completionRate: 101, totalFocusMinutes: -1, completedGoalCount: 0, rewardCount: 0 },
      trend: [],
    });
    expect(result.success).toBe(false);
  });
});
