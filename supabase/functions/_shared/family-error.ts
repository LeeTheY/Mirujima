export interface SafeFamilyIssueFailure {
  code: "guardian_role_required" | "family_link_role_inconsistent" | "issue_rate_limited" | "active_guardian_exists" | "family_seat_required" | "family_seat_limit_reached" | "server_configuration_invalid" | "authentication_required" | "family_link_schema_invalid" | "family_link_data_conflict" | "family_code_issue_failed";
  status: number;
}

export interface SafeFamilyRedeemFailure {
  code: "student_role_required" | "active_guardian_exists" | "family_seat_required" | "family_seat_limit_reached" | "student_membership_conflict" | "server_configuration_invalid" | "authentication_required" | "family_code_redeem_failed";
  status: number;
}

function isAuthenticationFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return message.includes("로그인")
    || message.includes("인증")
    || normalized.includes("authentication required")
    || normalized.includes("invalid jwt")
    || normalized.includes("authorization");
}

export function familyFailureMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const message = Reflect.get(error, "message");
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}

export function classifyFamilyIssueFailure(message: string, databaseCode = ""): SafeFamilyIssueFailure {
  if (message.includes("guardian role inconsistent")) return { code: "family_link_role_inconsistent", status: 503 };
  if (message.includes("guardian role required")) return { code: "guardian_role_required", status: 403 };
  if (message.includes("rate limit")) return { code: "issue_rate_limited", status: 429 };
  if (message.includes("active guardian")) return { code: "active_guardian_exists", status: 409 };
  if (message.includes("family seat limit")) return { code: "family_seat_limit_reached", status: 409 };
  if (message.includes("family seat required")) return { code: "family_seat_required", status: 409 };
  if (message.includes("서버 서명 secret")) return { code: "server_configuration_invalid", status: 503 };
  if (message.includes("invalid code hash")) return { code: "server_configuration_invalid", status: 503 };
  if (isAuthenticationFailure(message)) return { code: "authentication_required", status: 401 };
  if (["42501", "42P01", "42703", "42883", "PGRST202"].includes(databaseCode)
    || message.includes("schema cache") || message.includes("permission denied")) {
    return { code: "family_link_schema_invalid", status: 503 };
  }
  if (["23502", "23503", "23505", "23514"].includes(databaseCode)
    || message.includes("violates") || message.includes("constraint")) {
    return { code: "family_link_data_conflict", status: 409 };
  }
  return { code: "family_code_issue_failed", status: 400 };
}

export function classifyFamilyRedeemFailure(message: string): SafeFamilyRedeemFailure {
  if (message.includes("student role required")) return { code: "student_role_required", status: 403 };
  if (message.includes("active guardian") || message.includes("already exists")) {
    return { code: "active_guardian_exists", status: 409 };
  }
  if (message.includes("family seat limit")) return { code: "family_seat_limit_reached", status: 409 };
  if (message.includes("family seat required")) return { code: "family_seat_required", status: 409 };
  if (message.includes("student membership conflict")) return { code: "student_membership_conflict", status: 409 };
  if (message.includes("서버 서명 secret")) return { code: "server_configuration_invalid", status: 503 };
  if (isAuthenticationFailure(message)) return { code: "authentication_required", status: 401 };
  return { code: "family_code_redeem_failed", status: 400 };
}
