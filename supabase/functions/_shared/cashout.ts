export interface CashoutRequestInput { points: number; idempotencyKey: string; }
export interface CashoutSettlementInput { requestId: string; outcome: "completed" | "rejected"; idempotencyKey: string; }

function idempotencyKey(value: unknown): string {
  const key = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new Error("현금화 요청 식별자가 올바르지 않습니다.");
  return key;
}

export function parseCashoutRequest(value: unknown): CashoutRequestInput {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (!Number.isSafeInteger(input.points) || (input.points as number) <= 0 || (input.points as number) >= 1_000_000_000) {
    throw new Error("현금화 포인트는 1P 이상의 정수여야 합니다.");
  }
  return { points: input.points as number, idempotencyKey: idempotencyKey(input.idempotencyKey) };
}

export function parseCashoutSettlement(value: unknown): CashoutSettlementInput {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const requestId = typeof input.requestId === "string" ? input.requestId.trim() : "";
  const outcome = input.outcome;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
    || (outcome !== "completed" && outcome !== "rejected")) {
    throw new Error("현금화 정산 정보가 올바르지 않습니다.");
  }
  return { requestId, outcome, idempotencyKey: idempotencyKey(input.idempotencyKey) };
}
