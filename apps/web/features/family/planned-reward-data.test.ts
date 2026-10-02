import { describe, expect, it, vi } from "vitest";
import { getPlannedGuardianReward, requestPlannedGuardianReward, withdrawPlannedGuardianReward } from "./planned-reward-data";
const owner = "f3111111-1111-4111-8111-111111111111";
const reward = { requestId: "f3222222-2222-4222-8222-222222222222", studentUserId: owner, scheduleId: "plan-1", sessionId: "f3333333-3333-4333-8333-333333333333", points: 2000, status: "pending" as const };
const client = (data: unknown, error: {message: string} | null = null) => ({ rpc: vi.fn().mockResolvedValue({ data, error }) });
describe("planned guardian rewards", () => {
  it("treats a missing request as no approval", async () => {
    expect(await getPlannedGuardianReward("plan-1", owner, client(null))).toBeNull();
  });
  it("requests the saved plan without client-supplied points or guardian identity", async () => {
    const api = client(reward);
    expect(await requestPlannedGuardianReward("plan-1", owner, api)).toEqual(reward);
    expect(api.rpc).toHaveBeenCalledWith("request_planned_guardian_reward", {p_schedule_id: "plan-1"});
  });
  it("rejects responses for a different plan or owner", async () => {
    for (const data of [{...reward, scheduleId: "other"}, {...reward, studentUserId: reward.requestId}]) {
      await expect(getPlannedGuardianReward("plan-1", owner, client(data))).rejects.toThrow("응답");
    }
  });
  it("rejects invalid amounts and session ids", async () => {
    for (const data of [{...reward, points: -1}, {...reward, points: 1.5}, {...reward, sessionId: "client-id"}]) {
      await expect(requestPlannedGuardianReward("plan-1", owner, client(data))).rejects.toThrow("응답");
    }
  });
  it("only acknowledges withdrawal for the requested transaction", async () => {
    const returned = {...reward, status: "returned"};
    expect(await withdrawPlannedGuardianReward(reward, client(returned))).toEqual(returned);
    await expect(withdrawPlannedGuardianReward(reward, client({...returned, requestId: reward.sessionId}))).rejects.toThrow("취소 결과");
    await expect(withdrawPlannedGuardianReward(reward, client({...reward, status: "approved"}))).rejects.toThrow("취소 결과");
  });
  it("does not expose raw RPC failures or guess approval", async () => {
    await expect(getPlannedGuardianReward("plan-1", owner, client(null, {message: "raw database details"}))).rejects.toThrow("상태를 다시 확인");
    await expect(requestPlannedGuardianReward("plan-1", owner, client(null, {message: "reward request rate limit"}))).rejects.toThrow("5분");
  });
});
