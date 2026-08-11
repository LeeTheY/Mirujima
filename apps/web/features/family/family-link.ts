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
  family_link_role_inconsistent: "보호자 역할 정보가 서버에서 일치하지 않습니다. 로그인 상태를 새로 확인해 주세요.",
  student_role_required: "연결 코드는 학생 계정에서만 입력할 수 있습니다.",
  issue_rate_limited: "코드를 여러 번 발급했습니다. 잠시 후 다시 시도해 주세요.",
  active_guardian_exists: "이미 활성 보호자와 연결된 학생입니다.",
  family_seat_required: "기본 학생 2명 좌석을 모두 사용 중입니다. 추가 학생 좌석을 결제해 주세요.",
  family_seat_limit_reached: "보호자 한 명당 학생은 최대 5명까지 연결할 수 있습니다.",
  student_membership_conflict: "학생 단독 멤버십과 보호자 가족 멤버십은 함께 사용할 수 없습니다. 학생 멤버십 만료 후 다시 연결해 주세요.",
  authentication_required: "로그인 상태를 다시 확인한 뒤 시도해 주세요.",
  server_configuration_invalid: "서버 연결 설정을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.",
  family_link_schema_invalid: "연결 기능의 서버 권한 또는 스키마가 준비되지 않았습니다.",
  family_link_data_conflict: "기존 연결 데이터와 충돌했습니다. 잠시 후 다시 시도해 주세요.",
  code_generation_conflict: "연결 코드 생성이 겹쳤습니다. 다시 발급해 주세요.",
  family_code_issue_failed: "연결 코드 발급 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  family_code_redeem_failed: "연결 코드 확인에 실패했습니다. 새 코드를 발급한 뒤 다시 시도해 주세요.",
  code_invalid_or_expired: "코드가 올바르지 않거나 만료되었습니다. 보호자에게 새 코드를 요청해 주세요.",
  redeem_locked: "입력 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.",
  function_fetch_failed: "연결 서버에 요청을 보내지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.",
  function_relay_failed: "연결 서버의 응답을 전달받지 못했습니다. 잠시 후 다시 시도해 주세요.",
  function_response_invalid: "연결 서버의 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

function gatewayErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const error = Reflect.get(body, "error");
  if (typeof error === "string") return error;
  const message = Reflect.get(body, "message");
  if (typeof message === "string" && /invalid jwt|authorization|로그인|인증/i.test(message)) {
    return "authentication_required";
  }
  return null;
}

export function familyLinkErrorCopy(code: string): string {
  const [publicCode, diagnosticCode] = code.split(":", 2);
  const copy = errorCopy[publicCode] ?? "연결 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  return diagnosticCode ? `${copy} (오류 코드: ${diagnosticCode})` : copy;
}

export function shouldRetryFamilyLinkRequest(code: string): boolean {
  const publicCode = code.split(":", 1)[0];
  return publicCode === "function_fetch_failed" || publicCode === "function_relay_failed";
}

export async function safeFunctionErrorCode(error: unknown): Promise<string> {
  if (!error || typeof error !== "object") return "unknown";
  const errorName = Reflect.get(error, "name");
  const context = Reflect.get(error, "context");
  if (context && typeof context === "object" && typeof Reflect.get(context, "json") === "function") {
    try {
      const body = await Reflect.apply(Reflect.get(context, "json"), context, []);
      const code = gatewayErrorCode(body);
      if (typeof code === "string" && Object.hasOwn(errorCopy, code)) {
        const diagnosticCode = body && typeof body === "object" ? Reflect.get(body, "diagnosticCode") : null;
        return typeof diagnosticCode === "string" && /^[a-z0-9_-]{1,40}$/i.test(diagnosticCode)
          ? `${code}:${diagnosticCode}`
          : code;
      }
    } catch {
      // Fall through to the Supabase function error category below.
    }
  }

  if (errorName === "FunctionsFetchError") return "function_fetch_failed";
  if (errorName === "FunctionsRelayError") return "function_relay_failed";
  if (errorName === "FunctionsHttpError") return "function_response_invalid";
  return "unknown";
}
