import { describe, expect, it } from "vitest";
import { formatFocusMinutes, formatHistoryRange, shortDateLabel, trendBarPercent } from "./history-format";

describe("history format", () => {
  it("formats minute totals without decimal hours", () => {
    expect(formatFocusMinutes(45)).toBe("45분");
    expect(formatFocusMinutes(120)).toBe("2시간");
    expect(formatFocusMinutes(135)).toBe("2시간 15분");
  });

  it("formats period ranges", () => {
    expect(formatHistoryRange("daily", "2026-08-24", "2026-08-24")).toBe("2026.08.24");
    expect(formatHistoryRange("monthly", "2026-08-01", "2026-08-31")).toBe("2026년 8월");
  });

  it("scales trend bars and keeps non-zero values visible", () => {
    expect(trendBarPercent(1, [1, 100])).toBe(4);
    expect(trendBarPercent(0, [0, 0])).toBe(0);
    expect(shortDateLabel("2026-08-24")).toBe("8/24");
  });
});
