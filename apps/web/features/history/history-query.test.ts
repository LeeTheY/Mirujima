import { describe, expect, it } from "vitest";
import { historyHref, normalizeHistoryQuery, shiftHistoryAnchor } from "./history-query";

const now = new Date("2026-08-24T12:00:00.000Z");

describe("history query", () => {
  it("normalizes invalid values to a safe daily query", () => {
    expect(normalizeHistoryQuery({ period: "yearly", date: "invalid", student: "not-a-uuid" }, now)).toEqual({
      period: "daily",
      anchorDate: "2026-08-24",
      studentId: null,
    });
  });

  it("keeps valid period, date, and student id", () => {
    expect(normalizeHistoryQuery({
      period: "weekly",
      date: "2026-08-20",
      student: "11111111-1111-4111-8111-111111111111",
    }, now)).toEqual({
      period: "weekly",
      anchorDate: "2026-08-20",
      studentId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("clamps dates older than the 365-day history window", () => {
    expect(normalizeHistoryQuery({ date: "2020-01-01" }, now).anchorDate).toBe("2025-08-25");
  });

  it("shifts daily, weekly, and clamped monthly anchors", () => {
    expect(shiftHistoryAnchor("2026-08-24", "daily", -1)).toBe("2026-08-23");
    expect(shiftHistoryAnchor("2026-08-24", "weekly", 1)).toBe("2026-08-31");
    expect(shiftHistoryAnchor("2026-03-31", "monthly", -1)).toBe("2026-02-28");
  });

  it("builds a query-only history link without changing the route", () => {
    expect(historyHref("monthly", "2026-08-24", "student-1")).toBe("?period=monthly&date=2026-08-24&student=student-1");
  });
});
