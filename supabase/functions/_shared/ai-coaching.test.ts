import { describe, expect, it } from "vitest";
import {
  isFocusCoachResult,
  isGuardianSummaryResult,
  isStudyRecommendationResult,
  isWeeklyReportResult,
  minimalGuardianAggregates,
  minimalStudentHistory,
  parseFocusCoachInput,
} from "./ai-coaching";

describe("AI coaching server boundary", () => {
  it("accepts only bounded focus input", () => {
    expect(parseFocusCoachInput({ title: "수학", targetFocusMinutes: 50, goals: [{ name: "오답", detail: "", minutes: 50 }] }))
      .toMatchObject({ title: "수학", targetFocusMinutes: 50 });
    expect(parseFocusCoachInput({ title: "수학", targetFocusMinutes: 0, goals: [] })).toBeNull();
  });

  it("validates every structured result shape", () => {
    expect(isFocusCoachResult({ summary: "요약", recommendedTitle: "수학", recommendedFocusMinutes: 50, recommendedBreakMinutes: 10, steps: ["오답"], reason: "기록 기준" })).toBe(true);
    expect(isFocusCoachResult({ summary: "요약", recommendedTitle: "수학", recommendedFocusMinutes: 50, recommendedBreakMinutes: 10, steps: ["오답"], reason: "기록 기준", rawProviderData: "private" })).toBe(false);
    expect(isGuardianSummaryResult({ title: "가족", summary: "요약", suggestions: [] })).toBe(false);
    expect(isStudyRecommendationResult({ title: "추천", summary: "요약", recommendedOrder: [{ subject: "수학", focusMinutes: 40, reason: "기록" }], nextAction: "계획 확인" })).toBe(true);
    expect(isWeeklyReportResult({ title: "주간", achievementSummary: "요약", wins: ["성공"], improvements: ["보완"], nextWeekPlan: ["계획"] })).toBe(true);
  });

  it("removes identifiers and raw fields from student history", () => {
    const result = minimalStudentHistory({
      summary: { completionRate: 80, totalFocusMinutes: 120, successfulSessionCount: 2, failedSessionCount: 1, focusStreakDays: 2 },
      trend: [{ dateKey: "2026-08-24", focusMinutes: 120, completionRate: 80, rawUrl: "https://private.example" }],
      sessions: [{ sessionId: "private-id", goals: [{ name: "수학", minutes: 50, completed: true }] }],
    });
    expect(result).toMatchObject({ recentGoals: [{ name: "수학", minutes: 50, completedCount: 1 }] });
    expect(JSON.stringify(result)).not.toContain("private-id");
    expect(JSON.stringify(result)).not.toContain("private.example");
  });

  it("keeps only consented aggregate fields from the guardian RPC result", () => {
    const result = minimalGuardianAggregates([{ displayName: "학생", completionRate: 80, totalFocusMinutes: 100, rewardStatus: "공유 허용", aiSummary: null, visitedUrls: ["private"] }]);
    expect(result).toEqual([{ displayName: "학생", completionRate: 80, totalFocusMinutes: 100, rewardStatus: "공유 허용", aiSummary: null }]);
  });
});

it("does not turn unshared family aggregates into zero achievement", () => {
  expect(minimalGuardianAggregates([{ displayName: "학생", completionRate: null, totalFocusMinutes: null }])).toMatchObject([{ completionRate: null, totalFocusMinutes: null }]);
});
