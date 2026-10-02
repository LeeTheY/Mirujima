import { z } from "zod";
import { guardianSharingPreferencesSchema, type GuardianSharingPreferences } from "@mirujima/contracts";
import { createClient } from "../../lib/supabase/client";
import { requireOnlineAction } from "../../lib/online";

export interface FamilyPrivacyRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

export async function saveGuardianSharingPreferences(
  preferences: GuardianSharingPreferences,
  client: FamilyPrivacyRpcClient = createClient() as unknown as FamilyPrivacyRpcClient,
): Promise<GuardianSharingPreferences> {
  requireOnlineAction("공유 설정 저장");
  const valid = guardianSharingPreferencesSchema.parse(preferences);
  const { data, error } = await client.rpc("set_guardian_sharing_preferences", { p_preferences: valid });
  if (error) throw new Error("공유 설정을 저장하지 못했습니다. 현재 설정은 유지됩니다. 다시 시도해 주세요.");
  const result = guardianSharingPreferencesSchema.safeParse(data);
  if (!result.success) throw new Error("공유 설정 저장 결과를 확인하지 못했습니다. 최신 상태를 다시 불러와 주세요.");
  return result.data;
}

export function familyDisconnectErrorCopy(message: string | undefined): string {
  if (message?.includes("guardian funded focus must finish")) return "보호자 보상이 연결된 집중 세션을 먼저 종료하고 결과를 정산해 주세요.";
  if (message?.includes("reserved guardian points must be settled")) return "예약된 보호자 포인트의 정산이 남아 있습니다. 집중 결과를 정산한 뒤 다시 시도해 주세요.";
  if (message?.includes("pending guardian rewards must be resolved")) return "처리하지 않은 보상 요청이 있습니다. 학생이 시작 전 요청을 취소하거나 보호자가 거절한 뒤 연결을 해제해 주세요.";
  return "연결을 해제하지 못했습니다. 현재 연결은 유지됩니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.";
}

const disconnectResultSchema = z.object({ studentUserId: z.uuid(), status: z.literal("disconnected") });
export async function disconnectFamilyLink(
  studentUserId: string | null,
  client: FamilyPrivacyRpcClient = createClient() as unknown as FamilyPrivacyRpcClient,
): Promise<void> {
  requireOnlineAction("가족 연결 해제");
  if (studentUserId !== null) z.uuid().parse(studentUserId);
  const { data, error } = await client.rpc("disconnect_family_link", { p_student_user_id: studentUserId });
  if (error) throw new Error(familyDisconnectErrorCopy(error.message));
  const result = disconnectResultSchema.safeParse(data);
  if (!result.success || (studentUserId !== null && result.data.studentUserId !== studentUserId)) {
    throw new Error("연결 해제 결과를 확인하지 못했습니다. 최신 연결 상태를 다시 확인해 주세요.");
  }
}
