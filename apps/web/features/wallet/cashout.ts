export function parseCashoutPoints(value: string, available: number): number {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) throw new Error("포인트는 소수점 없는 정수로 입력해 주세요.");
  const points = Number(normalized);
  if (!Number.isSafeInteger(points) || points < 1) throw new Error("현금화는 1P 이상부터 신청할 수 있습니다.");
  if (points > available) throw new Error("현금화 가능 잔액을 초과했습니다.");
  return points;
}

export function cashoutErrorCopy(code: string): string {
  if (code === "insufficient_earned_points") return "현금화 가능 earned 잔액이 부족합니다.";
  if (code === "invalid_cashout_points") return "현금화 포인트를 올바른 정수로 입력해 주세요.";
  if (code === "cashout_not_found") return "처리할 현금화 요청을 찾지 못했습니다.";
  if (code === "cashout_already_settled") return "이미 처리된 현금화 요청입니다.";
  if (code === "test_mode_required") return "현금화 샌드박스가 테스트 모드로 설정되지 않았습니다.";
  if (code === "authentication_required") return "로그인 후 다시 시도해 주세요.";
  return "현금화 요청을 처리하지 못했습니다. 다시 시도해 주세요.";
}
