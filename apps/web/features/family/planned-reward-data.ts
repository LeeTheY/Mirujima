import { plannedGuardianRewardSchema, type PlannedGuardianReward } from "@mirujima/contracts";
import type { GuardianRewardRpcClient } from "./guardian-reward-data";

function errorCopy(message: string | undefined): string {
  if (message?.includes("active guardian link")) return "보상을 요청하려면 보호자 계정을 먼저 연결해 주세요.";
  if (message?.includes("rate limit")) return "보상 요청이 많습니다. 5분 뒤 다시 시도해 주세요.";
  if (message?.includes("already started")) return "이미 시작한 집중의 보상은 취소할 수 없습니다. 세션을 먼저 완료해 주세요.";
  return "보상 상태를 확인하지 못했습니다. 승인·반환 여부는 상태를 다시 확인해 주세요.";
}

export async function getPlannedGuardianReward(planId: string, ownerId: string, client: GuardianRewardRpcClient): Promise<PlannedGuardianReward | null> {
  const { data, error } = await client.rpc("get_planned_guardian_reward", { p_schedule_id: planId });
  if (error) throw new Error(errorCopy(error.message));
  if (data === null) return null;
  return validate(data, planId, ownerId);
}

function validate(data: unknown, planId: string, ownerId: string): PlannedGuardianReward {
  const parsed = plannedGuardianRewardSchema.safeParse(data);
  if (!parsed.success || parsed.data.scheduleId !== planId || parsed.data.studentUserId !== ownerId) {
    throw new Error("보상 요청 응답을 확인하지 못했습니다. 상태를 다시 확인해 주세요.");
  }
  return parsed.data;
}

export async function requestPlannedGuardianReward(planId: string, ownerId: string, client: GuardianRewardRpcClient): Promise<PlannedGuardianReward> {
  const { data, error } = await client.rpc("request_planned_guardian_reward", { p_schedule_id: planId });
  if (error) throw new Error(errorCopy(error.message));
  const result = validate(data, planId, ownerId);
  if (!["pending", "approved"].includes(result.status)) throw new Error("보상 요청이 접수됐는지 상태를 다시 확인해 주세요.");
  return result;
}

export async function withdrawPlannedGuardianReward(request: PlannedGuardianReward, client: GuardianRewardRpcClient): Promise<PlannedGuardianReward> {
  const { data, error } = await client.rpc("withdraw_planned_guardian_reward", { p_request_id: request.requestId });
  if (error) throw new Error(errorCopy(error.message));
  const result = validate(data, request.scheduleId, request.studentUserId);
  if (result.requestId !== request.requestId || !["returned", "declined"].includes(result.status)) {
    throw new Error("보상 취소 결과를 확인하지 못했습니다. 상태를 다시 확인해 주세요.");
  }
  return result;
}
