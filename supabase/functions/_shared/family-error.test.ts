import { describe, expect, it } from "vitest";
import { classifyFamilyIssueFailure, classifyFamilyRedeemFailure, familyFailureMessage } from "./family-error";

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

  it("classifies gateway JWT failures as authentication failures", () => {
    expect(classifyFamilyIssueFailure("Invalid JWT")).toEqual({
      code: "authentication_required",
      status: 401,
    });
  });

  it("reads the message from a plain Supabase PostgREST error object", () => {
    expect(familyFailureMessage({ code: "P0001", message: "guardian role required" }, "fallback"))
      .toBe("guardian role required");
  });

  it("separates a role mismatch between the profile query and RPC", () => {
    expect(classifyFamilyIssueFailure("guardian role inconsistent", "P0001")).toEqual({
      code: "family_link_role_inconsistent",
      status: 503,
    });
  });

  it("classifies PostgreSQL authentication and hash exceptions", () => {
    expect(classifyFamilyIssueFailure("authentication required", "P0001")).toEqual({
      code: "authentication_required",
      status: 401,
    });
    expect(classifyFamilyIssueFailure("invalid code hash", "P0001")).toEqual({
      code: "server_configuration_invalid",
      status: 503,
    });
  });

  it("separates RPC schema and permission failures from role failures", () => {
    expect(classifyFamilyIssueFailure("permission denied for function", "42501")).toEqual({
      code: "family_link_schema_invalid",
      status: 503,
    });
    expect(classifyFamilyIssueFailure("function missing from schema cache", "PGRST202")).toEqual({
      code: "family_link_schema_invalid",
      status: 503,
    });
  });

  it("separates family link constraint conflicts", () => {
    expect(classifyFamilyIssueFailure("check constraint failed", "23514")).toEqual({
      code: "family_link_data_conflict",
      status: 409,
    });
  });

  it("returns actionable family seat and membership conflict codes", () => {
    expect(classifyFamilyIssueFailure("family seat required", "P0001")).toEqual({ code: "family_seat_required", status: 409 });
    expect(classifyFamilyIssueFailure("family seat limit reached", "P0001")).toEqual({ code: "family_seat_limit_reached", status: 409 });
    expect(classifyFamilyRedeemFailure("student membership conflict")).toEqual({ code: "student_membership_conflict", status: 409 });
  });

  it("classifies redeem signing configuration without exposing secret details", () => {
    expect(classifyFamilyRedeemFailure("서버 서명 secret 설정이 올바르지 않습니다.")).toEqual({
      code: "server_configuration_invalid",
      status: 503,
    });
  });
});
