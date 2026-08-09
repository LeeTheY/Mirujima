import { describe, expect, it } from "vitest";
import {
  FAMILY_ISSUER_ACTIONS,
  FAMILY_REDEEMER_ACTIONS,
  familyCodeDigits,
  familyLinkErrorCopy,
  initialRedeemerExpanded,
  safeFunctionErrorCode,
} from "./family-link";

describe("family linking surfaces", () => {
  it("keeps issue actions on the guardian and redeem on the student", () => {
    expect(FAMILY_ISSUER_ACTIONS).toEqual(["issue", "reissue", "cancel"]);
    expect(FAMILY_REDEEMER_ACTIONS).toEqual(["redeem"]);
    expect(initialRedeemerExpanded()).toBe(false);
  });

  it("maps safe server error codes to useful copy", () => {
    expect(familyLinkErrorCopy("origin_not_allowed")).toContain("접속 주소");
    expect(familyLinkErrorCopy("guardian_role_required")).toContain("보호자");
    expect(familyLinkErrorCopy("student_role_required")).toContain("학생");
    expect(familyLinkErrorCopy("issue_rate_limited")).toContain("잠시");
    expect(familyLinkErrorCopy("code_invalid_or_expired")).toContain("만료");
    expect(familyLinkErrorCopy("server_configuration_invalid")).toContain("서버 연결 설정");
    expect(familyLinkErrorCopy("unknown")).toContain("다시 시도");
  });

  it("reads a safe error code from a Supabase function Response", async () => {
    const error = { context: new Response(JSON.stringify({ error: "origin_not_allowed" })) };

    expect(await safeFunctionErrorCode(error)).toBe("origin_not_allowed");
  });

  it("rejects server error strings outside the public allowlist", async () => {
    const error = { context: new Response(JSON.stringify({ error: "database secret detail" })) };

    expect(await safeFunctionErrorCode(error)).toBe("unknown");
  });

  it("formats a partial family code as six visual digits", () => {
    expect(familyCodeDigits("12")).toEqual(["1", "2", "0", "0", "0", "0"]);
    expect(familyCodeDigits("12a34")).toEqual(["1", "2", "3", "4", "0", "0"]);
    expect(familyCodeDigits("1234567")).toEqual(["1", "2", "3", "4", "5", "6"]);
  });
});
