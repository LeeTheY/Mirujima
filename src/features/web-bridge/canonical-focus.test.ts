import { describe, expect, it } from "vitest";
import { canonicalFocusSessionSchema, type FocusPlan } from "@mirujima/contracts";
import {
  canonicalMetricPayload,
  canonicalRuntimeOwnershipChanged,
  canonicalToLocalFocus,
  isStaleCanonicalUpdate,
  shouldRetryPendingSettlement,
  syncCanonicalMetricsBestEffort,
} from "./canonical-focus";

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

const session = canonicalFocusSessionSchema.parse({
  id: "session-1",
  scheduleId: "plan-1",
  ownerUserId: plan.ownerUserId,
  startedAt: "2026-08-08T10:00:00.000Z",
  endsAt: "2026-08-08T10:50:00.000Z",
  targetFocusMinutes: 50,
  blockingMode: "blocklist",
  goals: plan.goals,
  status: "active",
});

describe("canonical focus adapter", () => {
  it("keeps canonical ids and absolute end time", () => {
    const local = canonicalToLocalFocus(plan, session);
    expect(local.schedule.id).toBe("plan-1");
    expect(local.schedule.status).toBe("focusing");
    expect(local.session.id).toBe("session-1");
    expect(local.session.endsAt).toBe("2026-08-08T10:50:00.000Z");
    expect(local.session.canonical).toBe(true);
    expect(local.session.goals).toEqual(plan.goals);
    expect(local.session.remainingFocusSeconds).toBe(3_000);
    expect(local.session.canonicalUpdatedAt).toBe(session.updatedAt);
  });

  it("rejects an older canonical update for the same local session", () => {
    const current = {
      ...canonicalToLocalFocus(plan, session).session,
      canonicalUpdatedAt: "2026-08-08T10:10:00.000Z",
    };
    expect(isStaleCanonicalUpdate(current, session)).toBe(true);
    expect(isStaleCanonicalUpdate({ ...current, id: "other-session" }, session)).toBe(false);
  });

  it("detects account boundaries and never retries another user's settlement", () => {
    const userId = plan.ownerUserId;
    expect(canonicalRuntimeOwnershipChanged(userId, userId, userId)).toBe(false);
    expect(canonicalRuntimeOwnershipChanged("22222222-2222-4222-8222-222222222222", userId, userId)).toBe(true);
    expect(canonicalRuntimeOwnershipChanged(null, "22222222-2222-4222-8222-222222222222", userId)).toBe(true);

    const pending = {
      idempotencyKey: "focus-finish:session-1",
      sessionId: "session-1",
      scheduleId: plan.id,
      completedGoalIds: [],
      deviceId: "device-1",
      createdAt: session.startedAt,
      lastAttemptAt: session.startedAt,
      attempts: 0,
      ownerUserId: userId,
    };
    expect(shouldRetryPendingSettlement(pending, userId, userId, userId)).toBe(true);
    expect(shouldRetryPendingSettlement(pending, "22222222-2222-4222-8222-222222222222", userId, userId)).toBe(false);
    expect(shouldRetryPendingSettlement({ ...pending, ownerUserId: undefined }, userId, userId, null)).toBe(true);
  });

  it("maps paused and terminal canonical states without losing the result", () => {
    const paused = canonicalFocusSessionSchema.parse({ ...session, status: "paused", remainingFocusSeconds: 1_200 });
    expect(canonicalToLocalFocus(plan, paused).session.status).toBe("paused");

    const terminal = canonicalFocusSessionSchema.parse({
      ...session,
      status: "success",
      result: {
        completedGoalIds: ["goal-1"],
        goalResults: [{ goalId: "goal-1", completed: true }],
        completedGoalCount: 1,
        totalGoalCount: 1,
        completionPercent: 100,
        earnedPoints: 1_000,
        returnedPoints: 0,
        settledAt: "2026-08-08T10:50:00.000Z",
      },
    });
    const local = canonicalToLocalFocus(plan, terminal);
    expect(local.schedule.status).toBe("completed");
    expect(local.session.result?.completionPercent).toBe(100);
  });

  it("rejects mismatched ownership", () => {
    expect(() => canonicalToLocalFocus(plan, { ...session, ownerUserId: "3b41e955-76e4-48ad-85f6-780f03c30547" })).toThrow("소유자");
  });

  it("builds privacy-safe aggregate metric payloads", () => {
    const local = canonicalToLocalFocus(plan, session).session;
    const payload = canonicalMetricPayload({ ...local, blockedAttemptCount: 3.9, idleSeconds: 20, distractionSeconds: -1, checkInCount: Number.NaN });
    expect(payload).toEqual({ blockedAttemptCount: 3, idleSeconds: 20, distractionSeconds: 0, checkInCount: 0 });
    expect(payload).not.toHaveProperty("hostname");
  });

  it("does not block lifecycle work when metric sync fails", async () => {
    const local = canonicalToLocalFocus(plan, session).session;
    const client = { rpc: async () => ({ data: null, error: { message: "offline" } }) };
    await expect(syncCanonicalMetricsBestEffort(local, "device-1", client)).resolves.toBe(false);
  });
});
