import { describe, expect, it } from "vitest";
import type { CanonicalFocusSession, FocusPlan } from "@mirujima/contracts";
import { canonicalToLocalFocus } from "./canonical-focus";

const plan: FocusPlan = {
  id: "plan-1",
  ownerUserId: "1d2f2214-6f91-48c0-9898-a403f02af7fc",
  title: "수학",
  description: "문제 풀이",
  dateKey: "2026-08-08",
  plannedStartAt: null,
  targetFocusMinutes: 50,
  activityMode: "interactive",
  blockingMode: "blocklist",
  allowedDomains: [],
  blockedDomains: [{ hostname: "youtube.com", includeSubdomains: true }],
  breakMinutes: 10,
  priority: "high",
  selfDepositPoints: 0,
  guardianRewardRequestPoints: 0,
  goals: [{ id: "goal-1", name: "수학 문제 풀이", detail: "", minutes: 50, priority: "high" }],
  status: "active",
  createdAt: "2026-08-08T10:00:00.000Z",
  updatedAt: "2026-08-08T10:00:00.000Z",
};

const session: CanonicalFocusSession = {
  id: "session-1",
  scheduleId: "plan-1",
  ownerUserId: plan.ownerUserId,
  startedAt: "2026-08-08T10:00:00.000Z",
  endsAt: "2026-08-08T10:50:00.000Z",
  targetFocusMinutes: 50,
  blockingMode: "blocklist",
  goals: plan.goals,
  status: "active",
};

describe("canonical focus adapter", () => {
  it("keeps canonical ids and absolute end time", () => {
    const local = canonicalToLocalFocus(plan, session);
    expect(local.schedule.id).toBe("plan-1");
    expect(local.schedule.status).toBe("focusing");
    expect(local.session.id).toBe("session-1");
    expect(local.session.endsAt).toBe("2026-08-08T10:50:00.000Z");
    expect(local.session.canonical).toBe(true);
  });

  it("rejects mismatched ownership", () => {
    expect(() => canonicalToLocalFocus(plan, { ...session, ownerUserId: "3b41e955-76e4-48ad-85f6-780f03c30547" })).toThrow("소유자");
  });
});
