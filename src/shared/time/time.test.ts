import { describe, expect, it } from "vitest";
import { elapsedBreakSeconds, elapsedFocusSeconds, getBreakTimeState, hasOverlap, remainingFocusSeconds, startOfNextDay, toDateKey } from "./time";

describe("시간 계산", () => {
  it("로컬 날짜 키를 만든다", () => expect(toDateKey(new Date(2026, 6, 14, 23, 59))).toBe("2026-07-14"));
  it("자정 다음 실행 시각을 만든다", () => {
    const next = startOfNextDay(new Date(2026, 6, 14, 23, 59));
    expect(toDateKey(next)).toBe("2026-07-15");
    expect(next.getHours()).toBe(0);
  });
  it("누적 집중 시간을 계산한다", () => expect(elapsedFocusSeconds("2026-07-14T00:00:00Z", null, 30, Date.parse("2026-07-14T00:01:00Z"))).toBe(90));
  it("남은 집중 시간은 휴식 시간이 아닌 집중 목표에서 누적 집중 시간만 뺀다", () => {
    expect(remainingFocusSeconds(50, 600)).toBe(2400);
    expect(remainingFocusSeconds(50, 3600)).toBe(0);
  });
  it("완료된 휴식과 진행 중인 휴식을 함께 누적한다", () => expect(elapsedBreakSeconds("2026-07-14T00:00:00Z", 120, Date.parse("2026-07-14T00:11:00Z"))).toBe(780));
  it("여러 휴식의 누적 시간이 권장 기준을 넘으면 초과 시간을 계산한다", () => {
    expect(getBreakTimeState(600, 240)).toEqual({ remaining: 360, overtime: 0 });
    expect(getBreakTimeState(600, 750)).toEqual({ remaining: 0, overtime: 150 });
  });
  it("겹치는 일정을 찾는다", () => expect(hasOverlap("2026-07-14T10:00:00Z", "2026-07-14T11:00:00Z", "2026-07-14T10:30:00Z", "2026-07-14T12:00:00Z")).toBe(true));
});
