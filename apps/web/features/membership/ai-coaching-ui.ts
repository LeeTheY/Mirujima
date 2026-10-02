export async function aiFunctionErrorCode(error: unknown): Promise<string> {
  if (!error || typeof error !== "object") return "unknown";
  const context = Reflect.get(error, "context");
  if (!context || typeof context !== "object" || typeof Reflect.get(context, "json") !== "function") return "unknown";
  try {
    const body = await Reflect.apply(Reflect.get(context, "json"), context, []);
    return body && typeof body === "object" && typeof Reflect.get(body, "error") === "string"
      ? Reflect.get(body, "error")
      : "unknown";
  } catch {
    return "unknown";
  }
}

export function aiCoachingErrorCopy(code: string): string {
  if (code === "ai_entitlement_required") return "현재 멤버십에서 이 AI 기능을 사용할 권한이 없습니다. 멤버십 기능과 가족 연결 상태를 확인해 주세요.";
  if (code === "ai_timeout") return "AI 처리 시간이 초과되었습니다. 기존 계획과 포인트는 변경되지 않았습니다. 다시 시도해 주세요.";
  if (code === "authentication_required") return "로그인이 만료되었습니다. 다시 로그인한 뒤 요청해 주세요.";
  if (code === "ai_role_required") return "이 계정 역할에서는 해당 AI 기능을 사용할 수 없습니다.";
  if (code === "guardian_consent_changed") return "학생의 공유 동의 또는 연결 정보가 바뀌어 요약을 표시하지 않았습니다. 동의를 확인한 뒤 다시 생성해 주세요.";
  if (code === "guardian_summary_data_required") return "AI 공유에 동의한 연결 학생이 없습니다. 학생 마이페이지의 AI 요약 공유 설정을 확인해 주세요.";
  if (code === "rate_limited") return "AI 요청 한도를 넘었습니다. 1분 뒤 다시 시도해 주세요. 기존 기록과 결과는 유지됩니다.";
  if (code === "invalid_ai_result") return "AI 결과 형식을 확인하지 못했습니다. 기존 기록과 결과는 유지되며 다시 시도할 수 있습니다.";
  if (code === "student_history_unavailable") return "분석할 집중 기록을 준비하지 못했습니다. 기록 탭을 새로고침한 뒤 다시 시도해 주세요.";
  if (code === "ai_writing_failed") return "AI 서버가 잠시 응답하지 않습니다. 기존 기록과 결과는 안전하며 다시 시도할 수 있습니다.";
  return "AI 결과를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
