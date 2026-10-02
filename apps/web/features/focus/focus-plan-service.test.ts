import { describe, expect, it, vi } from "vitest";
import { saveFocusPlan, cancelFocusPlan } from "./focus-plan-service";
import type { FocusPlan } from "@mirujima/contracts";
const plan: FocusPlan = {"title": "차단 집중", "description": "", "dateKey": "2026-10-02", "plannedStartAt": null, "targetFocusMinutes": 5, "activityMode": "interactive", "blockingMode": "blocklist", "allowedDomains": [], "blockedDomains": [{"hostname": "youtube.com", "includeSubdomains": true}], "breakMinutes": 5, "priority": "medium", "selfDepositPoints": 1000, "guardianRewardRequestPoints": 0, "goals": [{"id": "g1", "name": "목표", "detail": "", "minutes": 5, "priority": "medium"}], "status": "planned", "createdAt": "2026-10-02T00:00:00Z", "updatedAt": "2026-10-02T00:00:00Z", "id": "editable-plan", "ownerUserId": "f3111111-1111-4111-8111-111111111111"};

describe("focus plan persistence", () => {
  it("uses the existing identity and server revision when editing", async () => {
    const saved = { ...plan, title: "새 제목", updatedAt: "2026-10-02T01:00:00Z" };
    const rpc = vi.fn().mockResolvedValue({ data: saved, error: null });
    expect(await saveFocusPlan({ ...plan, title: "새 제목" }, "device", { rpc })).toEqual(saved);
    expect(rpc).toHaveBeenCalledWith("upsert_focus_plan", { p_schedule_id: plan.id, p_payload: { ...plan, title: "새 제목" }, p_device_id: "device" });
  });
  it("explains stale edits without exposing server details", async () => {
    await expect(saveFocusPlan(plan, "device", { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "focus plan changed; reload required" } }) })).rejects.toThrow("다른 창");
  });
  it("rejects a response for another account", async () => {
    await expect(saveFocusPlan(plan, "device", { rpc: vi.fn().mockResolvedValue({ data: { ...plan, ownerUserId: "f3222222-2222-4222-8222-222222222222" }, error: null }) })).rejects.toThrow("응답");
  });
  it("cancels with the revision and requires a cancelled response", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...plan, status: "cancelled" }, error: null });
    expect((await cancelFocusPlan(plan, { rpc })).status).toBe("cancelled");
    expect(rpc).toHaveBeenCalledWith("cancel_focus_plan", { p_schedule_id: plan.id, p_expected_updated_at: plan.updatedAt });
    await expect(cancelFocusPlan(plan, { rpc: vi.fn().mockResolvedValue({ data: plan, error: null }) })).rejects.toThrow("취소 응답");
  });
});
