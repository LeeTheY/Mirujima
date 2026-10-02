import type { WebToExtensionMessage } from "@mirujima/contracts";

export type ExternalMessageSender = (extensionId: string, message: WebToExtensionMessage) => Promise<unknown>;

export function requiresExtension(blockingMode: "allowlist" | "blocklist" | "off"): boolean {
  return blockingMode !== "off";
}

export type ExtensionConnectionStatus = "connected" | "unconfigured" | "unsupported" | "unavailable" | "signed-out" | "account-mismatch" | "outdated" | "timeout";
export interface ExtensionConnection { status: ExtensionConnectionStatus; message: string }

class BridgeError extends Error {
  constructor(readonly code: ExtensionConnectionStatus, message: string) { super(message); }
}

export function hasChromeExternalMessaging(): boolean {
  const chromeApi: unknown = Reflect.get(globalThis, "chrome");
  if (!chromeApi || typeof chromeApi !== "object") return false;
  const runtime: unknown = Reflect.get(chromeApi, "runtime");
  return Boolean(runtime && typeof runtime === "object" && typeof Reflect.get(runtime, "sendMessage") === "function");
}

async function sendBounded(extensionId: string, send: ExternalMessageSender, message: WebToExtensionMessage, timeoutMs: number): Promise<Record<string, unknown>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      send(extensionId, message),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new BridgeError("timeout", "확장 프로그램 응답 시간이 초과되었습니다. 확장 프로그램을 열고 다시 확인해 주세요.")), timeoutMs); }),
    ]);
    if (!response || typeof response !== "object" || Array.isArray(response)
      || Reflect.get(response, "version") !== 1
      || Reflect.get(response, "requestId") !== message.requestId) {
      throw new BridgeError("outdated", "확장 프로그램 응답을 확인할 수 없습니다. 최신 버전으로 다시 로드해 주세요.");
    }
    if (Reflect.get(response, "ok") !== true) {
      if (Reflect.get(response, "code") === "AUTH_REQUIRED") throw new BridgeError("signed-out", "확장 프로그램에서 Google 로그인이 필요합니다. 웹과 같은 계정으로 로그인해 주세요.");
      throw new BridgeError("unavailable", "확장 프로그램이 요청을 처리하지 못했습니다. 확장 프로그램과 연결 상태를 확인해 주세요.");
    }
    return response as Record<string, unknown>;
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

export async function checkExtensionConnection(extensionId: string, send: ExternalMessageSender = chromeExternalSender, expectedUserId?: string, requestId = crypto.randomUUID()): Promise<ExtensionConnection> {
  if (!extensionId) return { status: "unconfigured", message: "확장 프로그램 연결 설정이 준비되지 않았습니다. 계획과 기록은 이용할 수 있습니다." };
  if (send === chromeExternalSender && !hasChromeExternalMessaging()) return { status: "unsupported", message: "이 브라우저에서는 확장 프로그램 연결을 사용할 수 없습니다. 사이트 차단 집중은 컴퓨터의 Chrome에서 시작해 주세요." };
  try {
    const response = await sendBounded(extensionId, send, { type: "mirujima:ping", version: 1, requestId }, 5_000);
    if (typeof response.userId !== "string" || !response.userId) return { status: "outdated", message: "계정 확인을 지원하는 최신 확장 프로그램으로 다시 로드해 주세요." };
    if (expectedUserId && response.userId !== expectedUserId) return { status: "account-mismatch", message: "웹과 확장 프로그램의 계정이 다릅니다. 확장 프로그램에서 로그아웃한 뒤 웹과 같은 Google 계정으로 로그인해 주세요." };
    return { status: "connected", message: "같은 계정의 확장 프로그램과 연결되었습니다. 집중 시작 시 사이트 차단 적용을 다시 확인합니다." };
  } catch (error) {
    return error instanceof BridgeError ? { status: error.code, message: error.message }
      : { status: "unavailable", message: "확장 프로그램과 연결되지 않았습니다. 설치·활성화 상태를 확인하고 다시 연결해 주세요." };
  }
}

export async function pingExtension(extensionId: string, send: ExternalMessageSender, requestId = crypto.randomUUID(), expectedUserId?: string): Promise<boolean> {
  return (await checkExtensionConnection(extensionId, send, expectedUserId, requestId)).status === "connected";
}

export async function requestFocusSync(extensionId: string, send: ExternalMessageSender, scheduleId: string, sessionId: string, requestId = crypto.randomUUID()): Promise<void> {
  const response = await sendBounded(extensionId, send, { type: "mirujima:focus-sync-request", version: 1, requestId, scheduleId, sessionId }, 10_000);
  if (response.sessionId !== sessionId || response.status !== "active") {
    throw new Error("사이트 차단 적용과 세션 시작을 확인하지 못했습니다. 현재 세션 상태를 다시 확인해 주세요.");
  }
}

export async function requestFocusReconcile(extensionId: string, send: ExternalMessageSender, scheduleId: string, sessionId: string, requestId = crypto.randomUUID()): Promise<void> {
  const response = await sendBounded(extensionId, send, { type: "mirujima:focus-reconcile-request", version: 1, requestId, scheduleId, sessionId }, 10_000);
  if (response.sessionId !== sessionId) throw new Error("확장 프로그램의 세션 결과가 일치하지 않습니다.");
}

export const chromeExternalSender: ExternalMessageSender = async (extensionId, message) => {
  const chromeApi: unknown = Reflect.get(globalThis, "chrome");
  if (!chromeApi || typeof chromeApi !== "object") throw new Error("extension unavailable");
  const runtime: unknown = Reflect.get(chromeApi, "runtime");
  if (!runtime || typeof runtime !== "object") throw new Error("extension unavailable");
  const sendMessage: unknown = Reflect.get(runtime, "sendMessage");
  if (typeof sendMessage !== "function") throw new Error("extension unavailable");
  return sendMessage.call(runtime, extensionId, message);
};
