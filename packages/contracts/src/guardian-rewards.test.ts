import { describe, expect, it } from "vitest";
import { guardianRewardActionResultSchema, guardianRewardRequestListSchema } from "./index";

describe("guardian reward contracts", () => {
  it("accepts pending request and idempotent approval results", () => {
    expect(guardianRewardRequestListSchema.parse({ items: [{
      id: "11111111-1111-4111-8111-111111111111",
      studentUserId: "22222222-2222-4222-8222-222222222222",
      studentDisplayName: "학생 A",
      points: 2_000,
      scheduleId: "schedule-1",
      sessionId: "session-1",
      status: "pending",
      createdAt: "2026-08-24T10:00:00.000Z",
    }] }).items).toHaveLength(1);
    expect(guardianRewardActionResultSchema.parse({
      requestId: "11111111-1111-4111-8111-111111111111",
      studentUserId: "22222222-2222-4222-8222-222222222222",
      reservationId: "33333333-3333-4333-8333-333333333333",
      points: 2_000,
      status: "approved",
    }).status).toBe("approved");
  });

  it("rejects client-invented states and non-positive rewards", () => {
    expect(() => guardianRewardRequestListSchema.parse({ items: [{
      id: "bad", studentUserId: "bad", studentDisplayName: "", points: 0,
      scheduleId: "x", sessionId: "x", status: "paid", createdAt: "bad",
    }] })).toThrow();
  });
});
