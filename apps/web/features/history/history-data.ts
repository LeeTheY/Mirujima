import {
  guardianFocusHistorySchema,
  studentFocusHistorySchema,
  type GuardianFocusHistory,
  type HistoryPeriod,
  type StudentFocusHistory,
} from "@mirujima/contracts";
import { createClient } from "../../lib/supabase/server";

export interface HistoryRpcClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown | null }>;
}

export interface HistoryLoadResult<T> {
  data: T | null;
  error: string | null;
}

async function serverClient(): Promise<HistoryRpcClient> {
  return await createClient() as unknown as HistoryRpcClient;
}

export async function loadStudentFocusHistory(
  period: HistoryPeriod,
  anchorDate: string,
  client?: HistoryRpcClient,
): Promise<HistoryLoadResult<StudentFocusHistory>> {
  const rpcClient = client ?? await serverClient();
  const { data, error } = await rpcClient.rpc("get_student_focus_history", {
    p_period: period,
    p_anchor_date: anchorDate,
  });
  if (error) return { data: null, error: "집중 기록을 불러오지 못했습니다. 기록은 변경되지 않았으며 다시 시도할 수 있습니다." };
  const parsed = studentFocusHistorySchema.safeParse(data);
  return parsed.success
    ? { data: parsed.data, error: null }
    : { data: null, error: "서버 기록 형식을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." };
}

export async function loadGuardianFocusHistory(
  studentUserId: string,
  period: HistoryPeriod,
  anchorDate: string,
  client?: HistoryRpcClient,
): Promise<HistoryLoadResult<GuardianFocusHistory>> {
  const rpcClient = client ?? await serverClient();
  const { data, error } = await rpcClient.rpc("get_guardian_focus_history", {
    p_student_user_id: studentUserId,
    p_period: period,
    p_anchor_date: anchorDate,
  });
  if (error) return { data: null, error: "학생 기록을 불러오지 못했습니다. 공유 설정과 연결 상태는 변경되지 않았습니다." };
  const parsed = guardianFocusHistorySchema.safeParse(data);
  return parsed.success
    ? { data: parsed.data, error: null }
    : { data: null, error: "공유된 기록 형식을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." };
}

export async function loadHistoryTimeZone(studentUserId?: string): Promise<string> {
  const client = await serverClient();
  const { data, error } = await client.rpc("get_focus_history_context", { p_student_user_id: studentUserId ?? null });
  if (error || !data || typeof data !== "object") return "Asia/Seoul";
  const tz = Reflect.get(data, "timezone");
  try { if (typeof tz === "string") { new Intl.DateTimeFormat("ko", { timeZone: tz }); return tz; } } catch { /* legacy configuration */ }
  return "Asia/Seoul";
}
