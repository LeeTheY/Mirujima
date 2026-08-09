export function parseCashoutPoints(raw: string, available: number): number {
  const normalized = raw.trim();
  if (!/^\d+$/.test(normalized)) {
    if (normalized.includes(".")) throw new Error("1P 이상의 포인트를 정수로 입력해 주세요.");
    throw new Error("1P 이상의 포인트를 입력해 주세요.");
  }
  const value = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("1P 이상의 포인트를 입력해 주세요.");
  if (value > available) throw new Error("현금화 가능 잔액이 부족합니다.");
  return value;
}

export function cashoutFullAmount(available: number): string {
  if (!Number.isSafeInteger(available) || available < 1) {
    throw new Error("환급 가능한 earned 포인트가 없습니다.");
  }
  return String(available);
}

export function cashoutErrorCopy(code: string): string {
  if (code === "insufficient_earned_points" || code.includes("잔액")) return "현금화 가능 잔액이 부족합니다.";
  if (code === "invalid_amount" || code.includes("1P")) return "1P 이상의 포인트를 정수로 입력해 주세요.";
  return "현금화 요청을 처리하지 못했습니다. 다시 시도해 주세요.";
}
