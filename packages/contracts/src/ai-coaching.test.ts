import { describe, expect, it } from "vitest";
import {
  aiCoachingRequestSchema,
  aiCoachingResultSchema,
  focusCoachRequestSchema,
  guardianSummaryResultSchema,
} from "./index";

describe("AI coaching contracts", () => {
  it("accepts a bounded focus plan without payment or browsing data", () => {
    expect(focusCoachRequestSchema.parse({
      action: "focus-coach",
      title: "수학 복습",
      targetFocusMinutes: 50,
      goals: [{ name: "오답 정리", detail: "10문제", minutes: 50 }],
    }).goals).toHaveLength(1);
    expect(() => focusCoachRequestSchema.parse({
      action: "focus-coach",
      title: "수학",
      targetFocusMinutes: 50,
      goals: [{ name: "오답", detail: "", minutes: 50 }],
      points: 10_000,
    })).toThrow();
  });

  it("supports all four approved coaching tasks", () => {
    for (const action of ["study-recommendation", "guardian-summary", "weekly-report"] as const) {
      expect(aiCoachingRequestSchema.parse({ action }).action).toBe(action);
    }
  });

  it("rejects malformed structured provider output", () => {
    expect(aiCoachingResultSchema.safeParse({
      task: "study-recommendation",
      title: "이번 학습 순서",
      summary: "최근 기록 기준 추천입니다.",
      recommendedOrder: [{ subject: "수학", focusMinutes: 40, reason: "최근 목표에 자주 포함됐습니다." }],
      nextAction: "40분 계획을 확인한 뒤 직접 저장하세요.",
    }).success).toBe(true);
    expect(guardianSummaryResultSchema.safeParse({
      task: "guardian-summary",
      title: "가족 요약",
      summary: "집중 기록",
      suggestions: [],
    }).success).toBe(false);
  });
});
