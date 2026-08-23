import { describe, expect, it, vi } from "vitest";
import {
  approveGuardianRewardRequest,
  guardianRewardErrorCopy,
  listGuardianRewardRequests,
} from "./guardian-reward-data";

const request = {
  id: "11111111-1111-4111-8111-111111111111",
  studentUserId: "22222222-2222-4222-8222-222222222222",
  studentDisplayName: "학생 A",
  points: 2_000,
  scheduleId: "schedule-1",
  sessionId: "session-1",
  status: "pending",
  createdAt: "2026-08-24T10:00:00.000Z",
};

describe("guardian reward gateway", () => {
  it("loads validated requests and approves by request id only", async () => {
    const listRpc = vi.fn().mockResolvedValue({ data: { items: [request] }, error: null });
    await expect(listGuardianRewardRequests({ rpc: listRpc })).resolves.toHaveLength(1);

    const approveRpc = vi.fn().mockResolvedValue({ data: {
      requestId: request.id,
      studentUserId: request.studentUserId,
      reservationId: "33333333-3333-4333-8333-333333333333",
      points: 2_000,
      status: "approved",
    }, error: null });
    await expect(approveGuardianRewardRequest(request.id, { rpc: approveRpc })).resolves.toMatchObject({ status: "approved" });
    expect(approveRpc).toHaveBeenCalledWith("approve_guardian_reward_request", { p_request_id: request.id });
  });

  it("maps server boundaries to safe actionable copy", () => {
    expect(guardianRewardErrorCopy("insufficient guardian topup points")).toContain("충전");
    expect(guardianRewardErrorCopy("reward request is no longer pending")).toContain("종료");
    expect(guardianRewardErrorCopy("database detail")).not.toContain("database detail");
  });
});
