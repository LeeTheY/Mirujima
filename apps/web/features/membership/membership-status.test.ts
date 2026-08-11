import { describe, expect, it } from "vitest";
import { resolveMembershipStatus } from "./membership-status";

describe("membership status", () => {
  const now = new Date("2026-08-10T00:00:00.000Z");

  it("shows a missing membership row as the free plan", () => {
    expect(resolveMembershipStatus(null, now).tier).toBe("free");
  });

  it("shows an active unexpired premium membership", () => {
    const result = resolveMembershipStatus({
      plan: "premium",
      status: "active",
      productCode: "student_premium",
      membershipSource: "direct",
      current_period_ends_at: "2026-09-10T00:00:00.000Z",
    }, now);
    expect(result.tier).toBe("premium");
    expect(result.badge).toBe("학생 Premium 이용 중");
    expect(result.periodEndsOn).toContain("2026년");
  });

  it("shows inherited and guardian family memberships distinctly", () => {
    expect(resolveMembershipStatus({
      plan: "premium", status: "active", productCode: "student_premium", membershipSource: "guardian_family",
      currentPeriodEndsAt: "2026-09-10T00:00:00.000Z",
    }, now).badge).toBe("가족 Premium 소속");
    const guardian = resolveMembershipStatus({
      plan: "premium", status: "active", productCode: "guardian_family", membershipSource: "direct",
      currentPeriodEndsAt: "2026-09-10T00:00:00.000Z", activeStudentCount: 2, seatCapacity: 3,
    }, now);
    expect(guardian.badge).toBe("가족 Premium 이용 중");
    expect([guardian.activeStudentCount, guardian.seatCapacity]).toEqual([2, 3]);
  });

  it("shows expired or inactive premium records as free", () => {
    expect(resolveMembershipStatus({
      plan: "premium",
      status: "active",
      current_period_ends_at: "2026-08-09T23:59:59.000Z",
    }, now).tier).toBe("free");
    expect(resolveMembershipStatus({ plan: "premium", status: "inactive" }, now).tier).toBe("free");
  });
});
