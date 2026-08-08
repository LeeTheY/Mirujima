import type { WebToExtensionMessage } from "@mirujima/contracts";

export type ExternalMessageSender = (extensionId: string, message: WebToExtensionMessage) => Promise<unknown>;

export function requiresExtension(blockingMode: "allowlist" | "blocklist" | "off"): boolean {
  return blockingMode !== "off";
}

export async function pingExtension(
  extensionId: string,
  send: ExternalMessageSender,
  requestId = crypto.randomUUID(),
): Promise<boolean> {
  if (!extensionId) return false;
  try {
    const response = await send(extensionId, { type: "mirujima:ping", version: 1, requestId });
    return Boolean(response && typeof response === "object" && Reflect.get(response, "ok") === true);
  } catch {
    return false;
  }
}

export async function requestFocusSync(
  extensionId: string,
  send: ExternalMessageSender,
  scheduleId: string,
  sessionId: string,
): Promise<void> {
  await send(extensionId, {
    type: "mirujima:focus-sync-request",
    version: 1,
    requestId: crypto.randomUUID(),
    scheduleId,
    sessionId,
  });
}

export const chromeExternalSender: ExternalMessageSender = async (extensionId, message) => {
  const chromeApi: unknown = Reflect.get(globalThis, "chrome");
  if (!chromeApi || typeof chromeApi !== "object") {
    throw new Error("extension unavailable");
  }
  const runtime: unknown = Reflect.get(chromeApi, "runtime");
  if (!runtime || typeof runtime !== "object") throw new Error("extension unavailable");
  const sendMessage: unknown = Reflect.get(runtime, "sendMessage");
  if (typeof sendMessage !== "function") throw new Error("extension unavailable");
  return sendMessage.call(runtime, extensionId, message);
};
