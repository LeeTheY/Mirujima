import { describe, expect, it } from "vitest";
import {
  FAMILY_ISSUER_ACTIONS,
  FAMILY_REDEEMER_ACTIONS,
  familyCodeDigits,
  familyLinkErrorCopy,
  initialRedeemerExpanded,
  safeFunctionErrorCode,
  shouldRetryFamilyLinkRequest,
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
    expect(familyLinkErrorCopy("family_link_role_inconsistent")).toContain("일치하지 않습니다");
    expect(familyLinkErrorCopy("student_role_required")).toContain("학생");
    expect(familyLinkErrorCopy("issue_rate_limited")).toContain("잠시");
    expect(familyLinkErrorCopy("code_invalid_or_expired")).toContain("만료");
    expect(familyLinkErrorCopy("server_configuration_invalid")).toContain("서버 연결 설정");
    expect(familyLinkErrorCopy("family_code_issue_failed")).toContain("발급");
    expect(familyLinkErrorCopy("family_link_schema_invalid")).toContain("스키마");
    expect(familyLinkErrorCopy("family_link_data_conflict")).toContain("충돌");
    expect(familyLinkErrorCopy("code_generation_conflict")).toContain("생성이 겹쳤습니다");
    expect(familyLinkErrorCopy("family_code_redeem_failed")).toContain("새 코드를 발급");
    expect(familyLinkErrorCopy("function_fetch_failed")).toContain("네트워크");
    expect(familyLinkErrorCopy("function_relay_failed")).toContain("응답");
    expect(familyLinkErrorCopy("function_response_invalid")).toContain("응답");
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

  it("maps a gateway JWT rejection to the login guidance", async () => {
    const error = { context: new Response(JSON.stringify({ code: 401, message: "Invalid JWT" })) };

    expect(await safeFunctionErrorCode(error)).toBe("authentication_required");
  });

  it("keeps a sanitized server diagnostic code for support", async () => {
    const error = { context: new Response(JSON.stringify({
      error: "family_code_issue_failed",
      diagnosticCode: "issue_rpc-57014",
    })) };

    const code = await safeFunctionErrorCode(error);
    expect(code).toBe("family_code_issue_failed:issue_rpc-57014");
    expect(familyLinkErrorCopy(code)).toContain("오류 코드: issue_rpc-57014");
  });

  it("classifies Supabase transport errors even when no JSON response exists", async () => {
    expect(await safeFunctionErrorCode({ name: "FunctionsFetchError", context: new TypeError("fetch failed") }))
      .toBe("function_fetch_failed");
    expect(await safeFunctionErrorCode({ name: "FunctionsRelayError", context: {} }))
      .toBe("function_relay_failed");
    expect(await safeFunctionErrorCode({ name: "FunctionsHttpError", context: {} }))
      .toBe("function_response_invalid");
  });

  it("retries only transient function transport failures", () => {
    expect(shouldRetryFamilyLinkRequest("function_fetch_failed")).toBe(true);
    expect(shouldRetryFamilyLinkRequest("function_relay_failed")).toBe(true);
    expect(shouldRetryFamilyLinkRequest("family_code_issue_failed:issue_rpc-P0001")).toBe(false);
  });

  it("formats a partial family code as six visual digits", () => {
    expect(familyCodeDigits("12")).toEqual(["1", "2", "0", "0", "0", "0"]);
    expect(familyCodeDigits("12a34")).toEqual(["1", "2", "3", "4", "0", "0"]);
    expect(familyCodeDigits("1234567")).toEqual(["1", "2", "3", "4", "5", "6"]);
  });
});
