import { describe, expect, it } from "vitest";
import * as contracts from "./index";

describe("Mirujima focus contracts", () => {
  it("accepts the two product roles only", () => {
    const schema = Reflect.get(contracts, "userRoleSchema") as { safeParse(value: unknown): { success: boolean } };

    expect(schema.safeParse("student").success).toBe(true);
    expect(schema.safeParse("guardian").success).toBe(true);
    expect(schema.safeParse("admin").success).toBe(false);
  });

  it("normalizes focus plan domains without changing the plan identity", () => {
    const normalizeFocusPlan = Reflect.get(contracts, "normalizeFocusPlan") as (value: unknown) => {
      id: string;
      blockedDomains: Array<{ hostname: string; includeSubdomains: boolean }>;
    };
    const now = "2026-08-08T12:00:00.000Z";

    const plan = normalizeFocusPlan({
      id: "schedule-1",
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      title: "수학 문제 풀이",
      description: "오답 10개 정리",
      dateKey: "2026-08-08",
      plannedStartAt: now,
      targetFocusMinutes: 25,
      activityMode: "interactive",
      blockingMode: "blocklist",
      allowedDomains: [],
      blockedDomains: [{ hostname: "https://WWW.YouTube.com/watch?v=1", includeSubdomains: true }],
      breakMinutes: 5,
      priority: "high",
      selfDepositPoints: 0,
      guardianRewardRequestPoints: 0,
      goals: [{ id: "goal-1", name: "오답 정리", detail: "10개", minutes: 25, priority: "high" }],
      status: "ready",
      createdAt: now,
      updatedAt: now
    });

    expect(plan.id).toBe("schedule-1");
    expect(plan.blockedDomains).toEqual([{ hostname: "youtube.com", includeSubdomains: true }]);
  });

  it("rejects unsafe focus durations and negative future point fields", () => {
    const schema = Reflect.get(contracts, "focusPlanSchema") as { safeParse(value: unknown): { success: boolean } };
    const now = "2026-08-08T12:00:00.000Z";
    const invalid = {
      id: "schedule-1",
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      title: "집중",
      description: "",
      dateKey: "2026-08-08",
      plannedStartAt: null,
      targetFocusMinutes: 0,
      activityMode: "reading",
      blockingMode: "off",
      allowedDomains: [],
      blockedDomains: [],
      breakMinutes: 5,
      priority: "medium",
      selfDepositPoints: -1,
      guardianRewardRequestPoints: 0,
      goals: [{ id: "goal-1", name: "집중", detail: "", minutes: 25, priority: "medium" }],
      status: "draft",
      createdAt: now,
      updatedAt: now
    };

    expect(schema.safeParse(invalid).success).toBe(false);
  });

  it("requires valid focus goals with unique ids", () => {
    const schema = Reflect.get(contracts, "focusGoalsSchema") as { safeParse(value: unknown): { success: boolean } };

    expect(schema.safeParse([{ id: "goal-1", name: "수학", detail: "", minutes: 25, priority: "high" }]).success).toBe(true);
    expect(schema.safeParse([]).success).toBe(false);
    expect(schema.safeParse([
      { id: "goal-1", name: "수학", detail: "", minutes: 25, priority: "high" },
      { id: "goal-1", name: "영어", detail: "", minutes: 25, priority: "medium" },
    ]).success).toBe(false);
  });

  it("rejects malformed or unknown external messages", () => {
    const parse = Reflect.get(contracts, "parseWebToExtensionMessage") as (value: unknown) => unknown;

    expect(() => parse({ type: "mirujima:ping", version: 2, requestId: "request-1" })).toThrow();
    expect(() => parse({ type: "mirujima:start-without-server", version: 1, requestId: "request-1" })).toThrow();
  });

  it("calculates remaining time from the canonical absolute end", () => {
    const remainingFocusMs = Reflect.get(contracts, "remainingFocusMs") as (endsAt: string, now?: number) => number;

    expect(remainingFocusMs("2026-08-08T12:25:00.000Z", Date.parse("2026-08-08T12:00:00.000Z"))).toBe(25 * 60_000);
    expect(remainingFocusMs("2026-08-08T12:25:00.000Z", Date.parse("2026-08-08T12:30:00.000Z"))).toBe(0);
  });
});
