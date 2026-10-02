import { canonicalFocusSessionSchema, type CanonicalFocusSession } from "@mirujima/contracts";
import { createClient } from "../../lib/supabase/client";

export interface FocusRpcClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

function browserClient(): FocusRpcClient {
  return createClient() as unknown as FocusRpcClient;
}

function parseSession(value: unknown): CanonicalFocusSession {
  const parsed = canonicalFocusSessionSchema.safeParse(value);
  if (!parsed.success) throw new Error("집중 세션 응답을 확인하지 못했습니다.");
  return parsed.data;
}

async function sessionRpc(
  client: FocusRpcClient,
  name: string,
  args?: Record<string, unknown>,
): Promise<CanonicalFocusSession> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error("집중 세션 상태를 저장하지 못했습니다.");
  return parseSession(data);
}

export async function getCurrentCanonicalFocusSession(
  client: FocusRpcClient = browserClient(),
): Promise<CanonicalFocusSession | null> {
  const { data, error } = await client.rpc("get_current_focus_session");
  if (error) throw new Error("진행 중인 집중 세션을 불러오지 못했습니다.");
  return data === null ? null : parseSession(data);
}

export async function getCanonicalFocusSession(
  client: FocusRpcClient,
  sessionId: string,
): Promise<CanonicalFocusSession | null> {
  const { data, error } = await client.rpc("get_focus_session", { p_session_id: sessionId });
  if (error) throw new Error("집중 세션 상태를 불러오지 못했습니다.");
  return data === null ? null : parseSession(data);
}

export function pauseCanonicalFocusSession(
  client: FocusRpcClient,
  sessionId: string,
  deviceId: string,
): Promise<CanonicalFocusSession> {
  return sessionRpc(client, "pause_focus_session", { p_session_id: sessionId, p_device_id: deviceId });
}

export function resumeCanonicalFocusSession(
  client: FocusRpcClient,
  sessionId: string,
  deviceId: string,
): Promise<CanonicalFocusSession> {
  return sessionRpc(client, "resume_focus_session", { p_session_id: sessionId, p_device_id: deviceId });
}

export function finishCanonicalFocusSession(
  client: FocusRpcClient,
  sessionId: string,
  completedGoalIds: string[],
  deviceId: string,
): Promise<CanonicalFocusSession> {
  return sessionRpc(client, "finish_focus_session", {
    p_session_id: sessionId,
    p_completed_goal_ids: completedGoalIds,
    p_device_id: deviceId,
  });
}

export function cancelCanonicalFocusStart(client: FocusRpcClient, sessionId: string, deviceId: string): Promise<CanonicalFocusSession> {
  return sessionRpc(client, "cancel_focus_start", { p_session_id: sessionId, p_device_id: deviceId });
}

export async function startCanonicalFocusBreak(client: FocusRpcClient, sessionId: string, deviceId: string, requestId: string): Promise<CanonicalFocusSession> {
  return sessionRpc(client, "start_focus_break", { p_session_id: sessionId, p_device_id: deviceId, p_request_id: requestId });
}
