export const FAMILY_ISSUER_ACTIONS = ["issue", "reissue", "cancel"] as const;
export const FAMILY_REDEEMER_ACTIONS = ["redeem"] as const;

export function initialRedeemerExpanded(): boolean {
  return false;
}

export function familyCodeDigits(value: string): string[] {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  return Array.from({ length: 6 }, (_, index) => digits[index] ?? "0");
}

const errorCopy: Record<string, string> = {
  origin_not_allowed: "허용되지 않은 접속 주소입니다. 로컬 환경 설정을 확인해 주세요.",
  guardian_role_required: "연결 코드는 보호자 계정에서만 발급할 수 있습니다.",
  student_role_required: "연결 코드는 학생 계정에서만 입력할 수 있습니다.",
  issue_rate_limited: "코드를 여러 번 발급했습니다. 잠시 후 다시 시도해 주세요.",
  active_guardian_exists: "이미 활성 보호자와 연결된 학생입니다.",
  authentication_required: "로그인 상태를 다시 확인한 뒤 시도해 주세요.",
  server_configuration_invalid: "서버 연결 설정을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.",
  code_invalid_or_expired: "코드가 올바르지 않거나 만료되었습니다. 보호자에게 새 코드를 요청해 주세요.",
  redeem_locked: "입력 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.",
};

export function familyLinkErrorCopy(code: string): string {
  return errorCopy[code] ?? "연결 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function safeFunctionErrorCode(error: unknown): Promise<string> {
  if (!error || typeof error !== "object") return "unknown";
  const context = Reflect.get(error, "context");
  if (!context || typeof context !== "object" || typeof Reflect.get(context, "json") !== "function") return "unknown";
  try {
    const body = await Reflect.apply(Reflect.get(context, "json"), context, []);
    const code = body && typeof body === "object" ? Reflect.get(body, "error") : null;
    return typeof code === "string" && Object.hasOwn(errorCopy, code) ? code : "unknown";
  } catch {
    return "unknown";
  }
}
