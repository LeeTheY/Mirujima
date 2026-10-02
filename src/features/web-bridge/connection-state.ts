export const WEB_CONNECTION_KEY = "mirujima:web-connection";
export interface WebConnectionState { userId: string | null; status: "connected" | "account-mismatch" | "signed-out"; checkedAt: string }
export function webConnectionLabel(state: WebConnectionState | null, userId: string | null, now = Date.now()) {
  if (!userId) return { label: "웹 연결 대기", connected: false };
  if (!state || state.userId !== userId || !Number.isFinite(Date.parse(state.checkedAt)) || now - Date.parse(state.checkedAt) > 90_000 || Date.parse(state.checkedAt) > now + 5_000) return { label: "웹 확인 대기", connected: false };
  return { label: state.status === "connected" ? "웹 연결됨" : state.status === "account-mismatch" ? "웹 계정 다름" : "웹 연결 대기", connected: state.status === "connected" };
}
export async function recordWebConnection(userId: string | null, status: WebConnectionState["status"]) {
  await chrome.storage.local.set({ [WEB_CONNECTION_KEY]: { userId, status, checkedAt: new Date().toISOString() } });
}

export function parseWebConnectionState(value: unknown): WebConnectionState | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if ((typeof item.userId !== "string" && item.userId !== null) || typeof item.checkedAt !== "string" || !["connected", "account-mismatch", "signed-out"].includes(String(item.status))) return null;
  return { userId: item.userId as string | null, checkedAt: item.checkedAt, status: item.status as WebConnectionState["status"] };
}
