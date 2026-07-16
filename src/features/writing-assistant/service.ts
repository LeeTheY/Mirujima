import { membershipDevicePayload, membershipSupabaseClient } from "../membership/service";
import { getMembershipCache } from "../membership/storage";
import { hasPremiumEntitlement } from "../membership/types";
import type { ContentSummaryResult, OcrBlock, OcrResult, WritingResult, WritingStyle } from "./types";
import { isContentSummaryResult, isOcrResult, isWritingResult } from "./validation";

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await membershipSupabaseClient().functions.invoke<T>("ai-writing", { body: { ...body, ...await membershipDevicePayload() } });
  if (error) {
    let message = error.message || "AI 요청을 처리하지 못했습니다.";
    const context = (error as unknown as { context?: Response }).context;
    if (context) {
      try {
        const detail = await context.clone().json() as { message?: unknown };
        if (typeof detail.message === "string") message = detail.message;
      } catch { /* 응답 본문이 JSON이 아니면 기본 오류를 사용합니다. */ }
    }
    throw new Error(message);
  }
  if (!data) throw new Error("AI 서버가 빈 응답을 반환했습니다.");
  return data;
}

export const writingAssistantService = {
  async ocr(imageDataUrl: string): Promise<OcrResult> {
    if (!hasPremiumEntitlement(await getMembershipCache(), "screen-ocr")) throw new Error("Premium 화면 OCR 권한이 필요합니다.");
    const result = await invoke<unknown>({ action: "ocr", imageDataUrl });
    if (!isOcrResult(result)) throw new Error("선택 영역의 글자 구조를 확인하지 못했습니다. 더 선명한 영역을 선택해 주세요.");
    return { text: result.text.slice(0, 20_000), blocks: result.blocks.slice(0, 200) };
  },

  async correct(text: string, style: WritingStyle): Promise<WritingResult> {
    if (!hasPremiumEntitlement(await getMembershipCache(), "grammar-correction")) throw new Error("Premium 문법 교정 권한이 필요합니다.");
    if (!text.trim() || text.length > 20_000) throw new Error("교정할 글은 1자 이상 20,000자 이하여야 합니다.");
    const result = await invoke<unknown>({ action: "correct", text, style });
    if (!isWritingResult(result)) throw new Error("AI 교정 결과 형식이 올바르지 않습니다. 다시 시도해 주세요.");
    return result;
  },

  async analyze(blocks: OcrBlock[], task: "content-summary" | "study-organize"): Promise<ContentSummaryResult> {
    const membership = await getMembershipCache();
    if (!hasPremiumEntitlement(membership, "screen-ocr") || !hasPremiumEntitlement(membership, "content-summary")) {
      throw new Error("Premium 화면 요약·학습 정리 권한이 필요합니다. 멤버십을 다시 확인해 주세요.");
    }
    const sanitized = blocks.map((block) => ({ ...block, text: block.text.trim() })).filter((block) => block.text).slice(0, 200);
    const totalLength = sanitized.reduce((sum, block) => sum + block.text.length, 0);
    if (!sanitized.length || totalLength > 20_000) throw new Error("분석할 OCR 원문은 1자 이상 20,000자 이하여야 합니다.");
    const result = await invoke<unknown>({ action: "analyze", task, blocks: sanitized });
    if (!isContentSummaryResult(result, task, new Set(sanitized.map((block) => block.id)))) {
      throw new Error("AI 요약 결과의 원문 근거를 확인하지 못했습니다. 다시 시도해 주세요.");
    }
    return result;
  }
};
