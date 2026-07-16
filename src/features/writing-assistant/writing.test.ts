import { describe, expect, it } from "vitest";
import { calculateCropRectangle, isSupportedCaptureUrl } from "./capture";
import { textDiff } from "./diff";
import { isContentSummaryResult, isOcrResult, isWritingResult } from "./validation";

describe("화면 선택 crop", () => {
  it("실제 screenshot 크기로 좌표를 보정한다", () => {
    expect(calculateCropRectangle({ x: 10, y: 20, width: 100, height: 50, viewportWidth: 500, viewportHeight: 400, devicePixelRatio: 2, canApply: false }, 1000, 800))
      .toEqual({ sx: 20, sy: 40, width: 200, height: 100 });
  });
  it("viewport 바깥을 자르지 않는다", () => {
    expect(calculateCropRectangle({ x: 480, y: 390, width: 100, height: 100, viewportWidth: 500, viewportHeight: 400, devicePixelRatio: 1, canApply: false }, 500, 400))
      .toEqual({ sx: 480, sy: 390, width: 20, height: 10 });
  });
  it("너무 작은 선택은 거부한다", () => expect(() => calculateCropRectangle({ x: 0, y: 0, width: 2, height: 2, viewportWidth: 100, viewportHeight: 100, devicePixelRatio: 1, canApply: false }, 100, 100)).toThrow());
  it("일반 웹페이지만 지원한다", () => {
    expect(isSupportedCaptureUrl("https://example.com/write")).toBe(true);
    expect(isSupportedCaptureUrl("chrome://settings")).toBe(false);
    expect(isSupportedCaptureUrl("chrome-extension://id/app.html")).toBe(false);
  });
});

describe("교정 diff", () => {
  it("추가와 삭제를 구분한다", () => {
    const result = textDiff("문장이 이상 해요", "문장이 이상해요");
    expect(result.some((part) => part.type === "removed")).toBe(true);
    expect(result.some((part) => part.type === "added")).toBe(true);
  });
  it("같은 문장은 한 조각이다", () => expect(textDiff("그대로 유지", "그대로 유지")).toEqual([{ value: "그대로 유지", type: "same" }]));
});

describe("교정 JSON 검증", () => {
  it("정상 구조화 결과를 허용한다", () => expect(isWritingResult({
    original: "안녕 하세요", corrected: "안녕하세요", polished: "안녕하세요.",
    changes: [{ type: "spacing", before: "안녕 하세요", after: "안녕하세요", reason: "띄어쓰기" }]
  })).toBe(true));
  it("알 수 없는 변경 유형을 거부한다", () => expect(isWritingResult({
    original: "a", corrected: "b", polished: "b", changes: [{ type: "unknown", before: "a", after: "b", reason: "x" }]
  })).toBe(false));
  it("필수 문장이 빠진 결과를 거부한다", () => expect(isWritingResult({ original: "a", changes: [] })).toBe(false));
});

describe("OCR block과 화면 요약 검증", () => {
  const blocks = [
    { id: "b1", type: "heading", text: "광합성" },
    { id: "b2", type: "paragraph", text: "식물은 빛 에너지를 화학 에너지로 바꾼다." },
    { id: "b3", type: "list-item", text: "엽록체에서 일어난다." }
  ];
  it("구조화 OCR block을 허용한다", () => expect(isOcrResult({ text: "광합성", blocks })).toBe(true));
  it("빈 OCR block은 거부한다", () => expect(isOcrResult({ text: "광합성", blocks: [] })).toBe(false));
  it("3~5개 핵심 내용과 유효한 block 근거를 허용한다", () => expect(isContentSummaryResult({
    title: "광합성 요약", mode: "content-summary", summary: "빛을 에너지로 바꾸는 과정이다.",
    keyPoints: [
      { text: "빛 에너지를 사용한다.", sourceBlockIds: ["b2"] },
      { text: "화학 에너지로 전환한다.", sourceBlockIds: ["b2"] },
      { text: "엽록체에서 일어난다.", sourceBlockIds: ["b3"] }
    ], sections: [{ heading: "개념", content: "광합성", sourceBlockIds: ["b1", "b2"] }], uncertainItems: []
  }, "content-summary", new Set(blocks.map((block) => block.id)))).toBe(true));
  it("존재하지 않는 근거 block을 거부한다", () => expect(isContentSummaryResult({
    title: "요약", mode: "study-organize", summary: "요약",
    keyPoints: [1, 2, 3].map((value) => ({ text: String(value), sourceBlockIds: ["b9"] })), sections: [], uncertainItems: []
  }, "study-organize", new Set(blocks.map((block) => block.id)))).toBe(false));
  it("핵심 내용이 5개를 넘으면 거부한다", () => expect(isContentSummaryResult({
    title: "요약", mode: "content-summary", summary: "요약",
    keyPoints: [1, 2, 3, 4, 5, 6].map((value) => ({ text: String(value), sourceBlockIds: ["b1"] })), sections: [], uncertainItems: []
  })).toBe(false));
});
