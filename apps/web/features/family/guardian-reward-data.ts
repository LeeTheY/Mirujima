import {
  guardianRewardActionResultSchema,
  guardianRewardRequestListSchema,
  type GuardianRewardActionResult,
  type GuardianRewardRequest,
} from "@mirujima/contracts";
import { createClient } from "../../lib/supabase/client";

export interface GuardianRewardRpcClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

function browserClient(): GuardianRewardRpcClient {
  return createClient() as unknown as GuardianRewardRpcClient;
}

export function guardianRewardErrorCopy(message: string | undefined): string {
  if (message?.includes("insufficient guardian topup points")) return "보호자 충전 포인트가 부족합니다. 포인트를 충전한 뒤 다시 승인해 주세요.";
  if (message?.includes("no longer pending")) return "계획이나 집중 상태가 변경되어 요청을 처리할 수 없습니다. 목록을 새로 확인해 주세요.";
  if (message?.includes("already declined")) return "이미 거절된 보상 요청입니다.";
  if (message?.includes("approved reward")) return "이미 승인된 보상은 거절할 수 없습니다.";
  if (message?.includes("active family link")) return "학생과의 활성 연결을 확인할 수 없습니다.";
  if (message?.includes("reward request not found")) return "보상 요청을 찾지 못했거나 처리 권한이 없습니다.";
  return "보상 요청을 처리하지 못했습니다. 최신 상태를 다시 확인해 주세요.";
}

export async function listGuardianRewardRequests(
  client: GuardianRewardRpcClient = browserClient(),
): Promise<GuardianRewardRequest[]> {
  const { data, error } = await client.rpc("get_guardian_reward_requests", { p_status: null });
  if (error) throw new Error("보상 요청 목록을 불러오지 못했습니다.");
  const parsed = guardianRewardRequestListSchema.safeParse(data);
  if (!parsed.success) throw new Error("보상 요청 목록 형식을 확인하지 못했습니다.");
  return parsed.data.items;
}

async function mutateReward(
  name: "approve_guardian_reward_request" | "decline_guardian_reward_request",
  requestId: string,
  client: GuardianRewardRpcClient,
): Promise<GuardianRewardActionResult> {
  if (!guardianRewardActionResultSchema.shape.requestId.safeParse(requestId).success) throw new Error("보상 요청 식별자를 확인하지 못했습니다.");
  const { data, error } = await client.rpc(name, { p_request_id: requestId });
  if (error) throw new Error(guardianRewardErrorCopy(error.message));
  const parsed = guardianRewardActionResultSchema.safeParse(data);
  if (!parsed.success || parsed.data.requestId !== requestId
    || parsed.data.status !== (name === "approve_guardian_reward_request" ? "approved" : "declined")
    || (name === "approve_guardian_reward_request" && !parsed.data.reservationId)) {
    throw new Error("보상 처리 결과를 확인하지 못했습니다. 목록을 다시 확인해 주세요.");
  }
  return parsed.data;
}

export function approveGuardianRewardRequest(
  requestId: string,
  client: GuardianRewardRpcClient = browserClient(),
): Promise<GuardianRewardActionResult> {
  return mutateReward("approve_guardian_reward_request", requestId, client);
}

export function declineGuardianRewardRequest(
  requestId: string,
  client: GuardianRewardRpcClient = browserClient(),
): Promise<GuardianRewardActionResult> {
  return mutateReward("decline_guardian_reward_request", requestId, client);
}
