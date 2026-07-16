import type { ExtensionMessage, MessageResponse } from "../types/messages";
import type { AppSnapshot } from "../types/models";

export async function sendMessage<T = AppSnapshot>(message: ExtensionMessage): Promise<T> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    throw new Error("Chrome 확장 프로그램 환경에서 실행해 주세요.");
  }
  const response = await chrome.runtime.sendMessage<ExtensionMessage, MessageResponse<T>>(message);
  if (!response?.ok) throw new Error(response?.error ?? "요청을 처리하지 못했습니다.");
  return response.data;
}

export function openExtensionPage(path = "app.html"): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL(path) });
}
