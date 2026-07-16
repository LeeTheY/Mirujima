import { beforeAll, describe, expect, it, vi } from "vitest";
import type { FocusSession, Schedule } from "../shared/types/models";
import { createBlockingRules } from "./blocking";

beforeAll(() => vi.stubGlobal("chrome", {
  declarativeNetRequest: {
    ResourceType: { MAIN_FRAME: "main_frame" },
    RuleActionType: { REDIRECT: "redirect", ALLOW: "allow" }
  }
}));

const session: FocusSession = { id: "session", scheduleId: "schedule", dateKey: "2026-07-14", startedAt: "2026-07-14T00:00:00Z", endedAt: null, pausedAt: null, accumulatedFocusSeconds: 0, distractionSeconds: 0, idleSeconds: 0, blockedAttemptCount: 0, checkInCount: 0, status: "active" };
const baseSchedule: Schedule = { id: "schedule", title: "작업", description: "", dateKey: "2026-07-14", startAt: "2026-07-14T00:00:00Z", endAt: "2026-07-14T01:00:00Z", targetFocusMinutes: 60, activityMode: "interactive", blockingMode: "allowlist", allowedDomains: [{ hostname: "example.com", includeSubdomains: true }], blockedDomains: [{ hostname: "video.example", includeSubdomains: true }], breakMinutes: 10, status: "focusing", snoozeCount: 0, createdAt: "2026-07-14T00:00:00Z", updatedAt: "2026-07-14T00:00:00Z" };

describe("DNR rule 생성", () => {
  it("allowlist는 허용 도메인을 제외한 main frame을 리디렉션한다", () => {
    const [redirect, allow] = createBlockingRules(baseSchedule, session, [], "chrome-extension://id/");
    expect(redirect.action.redirect?.regexSubstitution).toContain("blocked.html?host=");
    expect(allow.action.type).toBe("allow");
    expect(allow.condition.regexFilter).toContain("example\\.com");
  });
  it("blocklist는 지정 도메인만 대상으로 한다", () => {
    const [rule] = createBlockingRules({ ...baseSchedule, blockingMode: "blocklist" }, session, [], "chrome-extension://id/");
    expect(rule.condition.regexFilter).toContain("video\\.example");
  });
  it("일시정지 상태에는 규칙을 만들지 않는다", () => {
    expect(createBlockingRules(baseSchedule, { ...session, status: "paused" }, [], "chrome-extension://id/")).toEqual([]);
  });
});
