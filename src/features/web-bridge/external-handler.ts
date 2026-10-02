import { parseWebToExtensionMessage } from "@mirujima/contracts";
import { repository } from "../../shared/storage/repository";
import { EXTERNAL_REQUEST_RECEIPT_LIMIT, EXTERNAL_REQUEST_RECEIPT_TTL_MS } from "../../shared/constants";
import type { ExternalRequestReceipt } from "../../shared/types/models";
import { membershipSupabaseClient } from "../membership/service";
import { prepareCanonicalRuntimeForUser, reconcileCanonicalFocus } from "./canonical-focus";

export function isAllowedExternalSender(senderUrl: string | undefined, expectedOrigin: string): boolean {
  if (!senderUrl || !expectedOrigin) return false;
  try {
    return new URL(senderUrl).origin === new URL(expectedOrigin).origin
      && new URL(expectedOrigin).origin === expectedOrigin.replace(/\/$/, "");
  } catch {
    return false;
  }
}

class ExtensionAuthRequired extends Error {}

async function requireExtensionUser(): Promise<string> {
  const { data, error } = await membershipSupabaseClient().auth.getUser();
  if (error || !data.user) throw new ExtensionAuthRequired("확장 프로그램 로그인이 필요합니다.");
  return data.user.id;
}

export function retainFreshExternalRequestReceipts(
  receipts: ExternalRequestReceipt[],
  now = Date.now(),
): ExternalRequestReceipt[] {
  return receipts
    .filter((item) => Number.isFinite(Date.parse(item.processedAt))
      && now - Date.parse(item.processedAt) <= EXTERNAL_REQUEST_RECEIPT_TTL_MS)
    .sort((a, b) => Date.parse(b.processedAt) - Date.parse(a.processedAt))
    .slice(0, EXTERNAL_REQUEST_RECEIPT_LIMIT);
}

async function cachedResponse(requestId: string, userId: string): Promise<Record<string, unknown> | null> {
  const receipts = retainFreshExternalRequestReceipts(await repository.getExternalRequestReceipts());
  await repository.setExternalRequestReceipts(receipts);
  return receipts.find((item) => item.requestId === requestId && item.userId === userId)?.response ?? null;
}

async function rememberResponse(
  requestId: string,
  userId: string,
  response: Record<string, unknown>,
): Promise<void> {
  const receipts = retainFreshExternalRequestReceipts([
    { requestId, userId, response, processedAt: new Date().toISOString() },
    ...(await repository.getExternalRequestReceipts())
      .filter((item) => item.requestId !== requestId || item.userId !== userId),
  ]);
  await repository.setExternalRequestReceipts(receipts);
}

export async function handleExternalMessage(message: unknown, sender: chrome.runtime.MessageSender): Promise<Record<string, unknown>> {
  const expectedOrigin = import.meta.env.VITE_WEB_APP_ORIGIN ?? "";
  if (!isAllowedExternalSender(sender.url, expectedOrigin)) return { ok: false, error: "허용되지 않은 웹 origin입니다." };
  let parsed;
  try { parsed = parseWebToExtensionMessage(message); } catch { return { ok: false, code: "INVALID_REQUEST", error: "요청 형식을 확인할 수 없습니다." }; }
  try {
    const userId = await requireExtensionUser();
    await prepareCanonicalRuntimeForUser(userId);
    const cached = await cachedResponse(parsed.requestId, userId);
    if (cached) return cached;
    let response: Record<string, unknown>;
    if (parsed.type === "mirujima:ping") response = { ok: true, version: 1, requestId: parsed.requestId, userId };
    if (parsed.type === "mirujima:get-focus-status") {
      const session = await repository.getActiveSession();
      response = { ok: true, version: 1, requestId: parsed.requestId, sessionId: session?.id ?? null, status: session?.canonicalStatus ?? session?.status ?? "idle" };
    } else if (parsed.type !== "mirujima:ping") {
      const session = await reconcileCanonicalFocus(parsed.scheduleId, parsed.sessionId);
      response = { ok: true, version: 1, requestId: parsed.requestId, sessionId: parsed.sessionId, status: session?.status ?? "idle" };
    }
    await rememberResponse(parsed.requestId, userId, response!);
    return response!;
  } catch (error) {
    return { ok: false, version: 1, requestId: parsed.requestId,
      code: error instanceof ExtensionAuthRequired ? "AUTH_REQUIRED" : "SYNC_FAILED",
      error: error instanceof ExtensionAuthRequired ? "확장 프로그램 로그인이 필요합니다." : "집중 동기화에 실패했습니다. 연결 상태를 확인해 주세요." };
  }
}

export function registerExternalMessageHandler(): void {
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    void handleExternalMessage(message, sender).then(sendResponse);
    return true;
  });
}
