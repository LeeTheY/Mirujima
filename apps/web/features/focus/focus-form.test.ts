import { describe, expect, it } from "vitest";
import { completionPercentForGoals, parseFocusDraft, parseFocusGoals } from "./focus-form";

describe("focus plan form", () => {
  it("normalizes valid input", () => {
    const result = parseFocusDraft({
      title: "수학 문제 풀이",
      targetFocusMinutes: "50",
      selfDepositPoints: "3000",
      breakMinutes: "10",
      blockingMode: "blocklist",
      domains: "youtube.com, www.instagram.com",
    });
    expect(result).toEqual({
      title: "수학 문제 풀이",
      targetFocusMinutes: 50,
      selfDepositPoints: 3000,
      breakMinutes: 10,
      blockingMode: "blocklist",
      domains: ["youtube.com", "instagram.com"],
    });
  });

  it("rejects invalid duration", () => {
    expect(() => parseFocusDraft({
      title: "공부",
      targetFocusMinutes: "0",
      selfDepositPoints: "0",
      breakMinutes: "10",
      blockingMode: "off",
      domains: "",
    })).toThrow("집중 시간");
  });

  it("rejects negative or fractional deposit points", () => {
    const base = { title: "공부", targetFocusMinutes: "50", breakMinutes: "10", blockingMode: "off", domains: "" };
    expect(() => parseFocusDraft({ ...base, selfDepositPoints: "-1" })).toThrow("걸 포인트");
    expect(() => parseFocusDraft({ ...base, selfDepositPoints: "1.5" })).toThrow("걸 포인트");
  });

  it("validates the goal list before saving", () => {
    expect(parseFocusGoals([{ id: "goal-1", name: "수학", detail: "10쪽", minutes: 25, priority: "high" }])).toHaveLength(1);
    expect(() => parseFocusGoals([{ id: "goal-1", name: "", detail: "", minutes: 25, priority: "high" }])).toThrow("각 목표");
  });

  it("derives completion grades from completed goal counts", () => {
    expect(completionPercentForGoals(1, 0)).toBe(0);
    expect(completionPercentForGoals(1, 1)).toBe(100);
    expect(completionPercentForGoals(3, 1)).toBe(60);
    expect(completionPercentForGoals(3, 2)).toBe(80);
    expect(completionPercentForGoals(4, 2)).toBe(80);
    expect(completionPercentForGoals(4, 4)).toBe(100);
  });
});
