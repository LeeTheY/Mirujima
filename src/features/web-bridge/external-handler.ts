import { parseWebToExtensionMessage } from "@mirujima/contracts";
import { repository } from "../../shared/storage/repository";
import { membershipSupabaseClient } from "../membership/service";
import { activateCanonicalFocus } from "./canonical-focus";

export function isAllowedExternalSender(senderUrl: string | undefined, expectedOrigin: string): boolean {
  if (!senderUrl || !expectedOrigin) return false;
  try {
    return new URL(senderUrl).origin === new URL(expectedOrigin).origin
      && new URL(expectedOrigin).origin === expectedOrigin.replace(/\/$/, "");
  } catch {
    return false;
  }
}

async function requireExtensionUser(): Promise<void> {
  const { data, error } = await membershipSupabaseClient().auth.getUser();
  if (error || !data.user) throw new Error("확장 프로그램 로그인이 필요합니다.");
}

async function handleExternalMessage(message: unknown, sender: chrome.runtime.MessageSender): Promise<Record<string, unknown>> {
  const expectedOrigin = import.meta.env.VITE_WEB_APP_ORIGIN;
  if (!isAllowedExternalSender(sender.url, expectedOrigin)) return { ok: false, error: "허용되지 않은 웹 origin입니다." };
  try {
    const parsed = parseWebToExtensionMessage(message);
    await requireExtensionUser();
    if (parsed.type === "mirujima:ping") return { ok: true, version: 1 };
    if (parsed.type === "mirujima:get-focus-status") {
      const session = await repository.getActiveSession();
      return { ok: true, sessionId: session?.id ?? null, status: session?.status ?? "idle" };
    }
    await activateCanonicalFocus(parsed.scheduleId, parsed.sessionId);
    return { ok: true, sessionId: parsed.sessionId, status: "active" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "집중 동기화에 실패했습니다." };
  }
}

export function registerExternalMessageHandler(): void {
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    void handleExternalMessage(message, sender).then(sendResponse);
    return true;
  });
}
