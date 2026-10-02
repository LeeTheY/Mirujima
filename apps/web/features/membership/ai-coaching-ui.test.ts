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

it("distinguishes timeout, authentication, role and revoked consent", () => {
  expect(aiCoachingErrorCopy("ai_timeout")).toContain("초과");
  expect(aiCoachingErrorCopy("authentication_required")).toContain("로그인");
  expect(aiCoachingErrorCopy("ai_role_required")).toContain("계정 역할");
  expect(aiCoachingErrorCopy("guardian_consent_changed")).toContain("공유 동의");
});
