export const TOPUP_PRESETS = [10_000, 30_000, 50_000, 100_000, 150_000, 300_000] as const;
export type TopupPreset = typeof TOPUP_PRESETS[number];
export const isTopupPreset = (value: unknown): value is TopupPreset => typeof value === "number" && TOPUP_PRESETS.includes(value as TopupPreset);
export function selectTopupPreset(value: number): TopupPreset { if (!isTopupPreset(value)) throw new Error("지원하지 않는 충전 금액입니다."); return value; }
export function parseTopupOrder(value: unknown) {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (typeof item.orderId !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(item.orderId) || !isTopupPreset(item.amount) || item.points !== item.amount || item.orderName !== `Mirujima ${item.amount.toLocaleString("en-US")}P 충전`) throw new Error("충전 주문이 올바르지 않습니다.");
  return item as { orderId: string; amount: TopupPreset; points: TopupPreset; orderName: string };
}
export function parseTopupCallback(params: URLSearchParams) {
  const paymentKey = params.get("paymentKey")?.trim() ?? ""; const orderId = params.get("orderId")?.trim() ?? ""; const amount = Number(params.get("amount"));
  if (paymentKey.length < 6 || paymentKey.length > 200 || !/^[A-Za-z0-9_-]{6,64}$/.test(orderId) || !isTopupPreset(amount)) throw new Error("결제 결과가 올바르지 않습니다.");
  return { paymentKey, orderId, amount };
}
export function topupFailureCopy(code: string) {
  if (code === "PAY_PROCESS_CANCELED") return "결제가 취소되었습니다. 포인트는 충전되지 않았습니다.";
  if (code === "PAY_PROCESS_ABORTED") return "결제가 중단되었습니다. 다시 시도해 주세요.";
  if (code === "REJECT_CARD_COMPANY") return "카드사에서 결제를 거절했습니다. 다른 테스트 결제수단을 선택해 주세요.";
  return "포인트 충전을 완료하지 못했습니다. 다시 시도해 주세요.";
}
