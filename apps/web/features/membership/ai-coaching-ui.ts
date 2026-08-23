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
  if (code === "rate_limited") return "AI 요청 한도를 넘었습니다. 1분 뒤 다시 시도해 주세요. 기존 기록과 결과는 유지됩니다.";
  if (code === "invalid_ai_result") return "AI 결과 형식을 확인하지 못했습니다. 기존 기록과 결과는 유지되며 다시 시도할 수 있습니다.";
  if (code === "student_history_unavailable") return "분석할 집중 기록을 준비하지 못했습니다. 기록 탭을 새로고침한 뒤 다시 시도해 주세요.";
  if (code === "ai_writing_failed") return "AI 서버가 잠시 응답하지 않습니다. 기존 기록과 결과는 안전하며 다시 시도할 수 있습니다.";
  return "AI 결과를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
