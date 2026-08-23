import { describe, expect, it } from "vitest";
import { aiCoachingErrorCopy, aiFunctionErrorCode } from "./ai-coaching-ui";

describe("AI coaching UI states", () => {
  it("separates rate-limit, invalid output, and provider failure states", () => {
    expect(aiCoachingErrorCopy("rate_limited")).toContain("1분");
    expect(aiCoachingErrorCopy("invalid_ai_result")).toContain("결과 형식");
    expect(aiCoachingErrorCopy("ai_writing_failed")).toContain("기존 기록과 결과는 안전");
  });

  it("reads only the safe Edge Function error code", async () => {
    expect(await aiFunctionErrorCode({ context: { json: async () => ({ error: "rate_limited", detail: "private" }) } }))
      .toBe("rate_limited");
  });
});
