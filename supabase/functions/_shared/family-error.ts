export interface SafeFamilyIssueFailure {
  code: "guardian_role_required" | "issue_rate_limited" | "active_guardian_exists" | "server_configuration_invalid" | "authentication_required" | "family_code_issue_failed";
  status: number;
}

export function classifyFamilyIssueFailure(message: string): SafeFamilyIssueFailure {
  if (message.includes("guardian role required")) return { code: "guardian_role_required", status: 403 };
  if (message.includes("rate limit")) return { code: "issue_rate_limited", status: 429 };
  if (message.includes("active guardian")) return { code: "active_guardian_exists", status: 409 };
  if (message.includes("서버 서명 secret")) return { code: "server_configuration_invalid", status: 503 };
  if (message.includes("로그인") || message.includes("인증")) return { code: "authentication_required", status: 401 };
  return { code: "family_code_issue_failed", status: 400 };
}
