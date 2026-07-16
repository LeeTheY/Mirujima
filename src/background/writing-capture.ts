import { calculateCropRectangle, isSupportedCaptureUrl } from "../features/writing-assistant/capture";
import type { ScreenCaptureResult, ScreenSelection } from "../features/writing-assistant/types";
import { getMembershipCache } from "../features/membership/storage";
import { hasPremiumEntitlement } from "../features/membership/types";
import type { MessageResponse } from "../shared/types/messages";

// Groq의 4MB 제한은 Base64와 JSON 요청 전체에 적용될 수 있으므로
// 인코딩 전 JPEG는 충분한 여유를 둔 1.5MB 이하로 만든다.
const MAX_IMAGE_BYTES = 1_500_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function canvasDataUrl(source: OffscreenCanvas): Promise<{ imageDataUrl: string; width: number; height: number; byteSize: number }> {
  let canvas = source;
  for (let resizeAttempt = 0; resizeAttempt < 7; resizeAttempt += 1) {
    let smallestBlobSize = Number.POSITIVE_INFINITY;
    for (const quality of [0.88, 0.72, 0.56]) {
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
      smallestBlobSize = Math.min(smallestBlobSize, blob.size);
      if (blob.size <= MAX_IMAGE_BYTES) {
        return {
          imageDataUrl: `data:image/jpeg;base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`,
          width: canvas.width,
          height: canvas.height,
          byteSize: blob.size
        };
      }
    }

    // 화면 전체처럼 큰 선택도 다시 선택시키지 않고, OCR 글자 가독성을
    // 최대한 유지하는 비율로 축소한 뒤 용량 제한에 맞춰 재압축한다.
    const estimatedScale = Math.sqrt(MAX_IMAGE_BYTES / smallestBlobSize) * 0.92;
    const scale = Math.min(0.85, Math.max(0.5, estimatedScale));
    const nextWidth = Math.max(1, Math.floor(canvas.width * scale));
    const nextHeight = Math.max(1, Math.floor(canvas.height * scale));
    if (nextWidth === canvas.width && nextHeight === canvas.height) break;
    const resized = new OffscreenCanvas(nextWidth, nextHeight);
    const context = resized.getContext("2d");
    if (!context) throw new Error("선택 영역 이미지를 최적화하지 못했습니다.");
    context.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, nextWidth, nextHeight);
    canvas = resized;
  }
  throw new Error("선택 이미지를 전송 가능한 크기로 최적화하지 못했습니다. 다시 시도해 주세요.");
}

async function cropScreenshot(dataUrl: string, selection: ScreenSelection): Promise<{ imageDataUrl: string; width: number; height: number; byteSize: number }> {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  try {
    const crop = calculateCropRectangle(selection, bitmap.width, bitmap.height);
    if (crop.width * crop.height > 33_000_000) throw new Error("선택 영역의 해상도가 너무 큽니다. 더 작은 영역을 선택해 주세요.");
    const canvas = new OffscreenCanvas(crop.width, crop.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("선택 영역 이미지를 만들지 못했습니다.");
    context.drawImage(bitmap, crop.sx, crop.sy, crop.width, crop.height, 0, 0, crop.width, crop.height);
    return await canvasDataUrl(canvas);
  } finally { bitmap.close(); }
}

export async function captureWritingArea(): Promise<ScreenCaptureResult> {
  if (!hasPremiumEntitlement(await getMembershipCache(), "screen-ocr")) throw new Error("Premium 화면 OCR 권한이 필요합니다.");
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined || tab.windowId === undefined || !isSupportedCaptureUrl(tab.url)) {
    throw new Error("일반 웹페이지에서만 화면 영역을 선택할 수 있습니다. chrome:// 페이지와 확장 프로그램 페이지는 지원하지 않습니다.");
  }
  let selectionResponse: MessageResponse<ScreenSelection>;
  try { selectionResponse = await chrome.tabs.sendMessage(tab.id, { type: "AI_BEGIN_SELECTION" }); }
  catch { throw new Error("이 페이지에서 선택 도구를 시작하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요."); }
  if (!selectionResponse?.ok) throw new Error(selectionResponse?.error ?? "화면 영역을 선택하지 못했습니다.");
  const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const cropped = await cropScreenshot(screenshot, selectionResponse.data);
  return { ...cropped, targetTabId: tab.id, canApply: selectionResponse.data.canApply };
}

export async function applyWritingToTab(tabId: number, text: string): Promise<void> {
  if (!Number.isInteger(tabId) || text.length === 0 || text.length > 20_000) throw new Error("적용할 문장이 올바르지 않습니다.");
  let response: MessageResponse<{ applied: boolean }>;
  try { response = await chrome.tabs.sendMessage(tabId, { type: "AI_APPLY_TEXT", tabId, text }); }
  catch { throw new Error("원래 입력창이 있는 탭을 찾지 못했습니다. 문장을 복사해 직접 붙여넣어 주세요."); }
  if (!response?.ok) throw new Error(response?.error ?? "입력창에 적용하지 못했습니다.");
}
