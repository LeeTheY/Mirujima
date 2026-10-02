import { describe, expect, it } from "vitest";
import { parseHomePlans } from "./home-plans";
const owner = "11111111-1111-4111-8111-111111111111";
const plan = {
  id: "plan", ownerUserId: owner, title: "집중", description: "", dateKey: "2026-10-02", plannedStartAt: null,
  targetFocusMinutes: 5, activityMode: "interactive", blockingMode: "off", allowedDomains: [], blockedDomains: [],
  breakMinutes: 5, priority: "medium", selfDepositPoints: 0, guardianRewardRequestPoints: 0,
  goals: [{ id: "goal", name: "목표", detail: "", minutes: 5, priority: "medium" }], status: "ready",
  createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
};
describe("home canonical plan data", () => {
  it("counts only canonical web plans while preserving legacy records", () => {
    expect(parseHomePlans([{ payload: { id: "legacy" } }, { payload: plan }], owner)).toHaveLength(1);
    expect(parseHomePlans([], owner)).toEqual([]);
  });
  it("does not turn malformed canonical data into an empty dashboard", () => {
    expect(parseHomePlans([{ payload: { ...plan, targetFocusMinutes: -1 } }], owner)).toBeNull();
    expect(parseHomePlans(null, owner)).toBeNull();
  });
  it("rejects a different tenant before rendering a plan", () => {
    expect(parseHomePlans([{ payload: { ...plan, ownerUserId: "22222222-2222-4222-8222-222222222222" } }], owner)).toBeNull();
  });
});
