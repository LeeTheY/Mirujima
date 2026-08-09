import { describe, expect, it } from "vitest";
import { classifyFamilyIssueFailure } from "./family-error";

describe("family issue safe errors", () => {
  it("exposes only an actionable safe code for invalid server signing configuration", () => {
    expect(classifyFamilyIssueFailure("서버 서명 secret 설정이 올바르지 않습니다.")).toEqual({
      code: "server_configuration_invalid",
      status: 503,
    });
  });

  it("does not expose unknown database messages", () => {
    expect(classifyFamilyIssueFailure("relation private_table failed")).toEqual({
      code: "family_code_issue_failed",
      status: 400,
    });
  });
});
