import { describe, expect, it } from "vitest";
import type { FocusPlan } from "@mirujima/contracts";
import { focusDraftFromPlan, focusPlanMatchesDraft, parseFocusDraft } from "./focus-form";
const plan: FocusPlan = {
  id: "plan", ownerUserId: "f3111111-1111-4111-8111-111111111111", title: "승인된 계획", dateKey: "2026-10-02", description: "10쪽 복습",
  plannedStartAt: null, targetFocusMinutes: 25, activityMode: "reading", blockingMode: "blocklist", allowedDomains: [], blockedDomains: [{hostname:"youtube.com",includeSubdomains:true}],
  breakMinutes: 5, priority: "high", selfDepositPoints: 1000, guardianRewardRequestPoints: 2000,
  goals: [{id:"g1",name:"복습",detail:"10쪽",minutes:25,priority:"high"}], status:"planned", createdAt:"2026-10-02T00:00:00Z", updatedAt:"2026-10-02T00:00:00Z",
};
describe("approved plan snapshot", () => {
  it("restores approved fields without disabled FormData values", () => {
    expect(focusDraftFromPlan(plan)).toMatchObject({title:"승인된 계획",selfDepositPoints:1000,guardianRewardRequestPoints:2000,domains:["youtube.com"]});
  });
  it("compares parsed form content to the stored plan", () => {
    const draft = parseFocusDraft({...focusDraftFromPlan(plan), domains:"youtube.com"});
    expect(focusPlanMatchesDraft(plan, draft, plan.goals)).toBe(true);
    expect(focusPlanMatchesDraft(plan, {...draft, title:"수정됨"}, plan.goals)).toBe(false);
    expect(focusPlanMatchesDraft(plan, {...draft, guardianRewardRequestPoints:3000}, plan.goals)).toBe(false);
    expect(focusPlanMatchesDraft(plan, draft, [{...plan.goals[0],minutes:50}])).toBe(false);
  });
});
