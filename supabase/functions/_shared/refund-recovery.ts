import { cancelTossPayment, fetchTossPayment, TossApiError, type TossTestConfig } from "./toss.ts";

export type RefundMode = "sandbox" | "provider_test" | "provider_live";
export function refundMode(value: string | undefined): RefundMode {
  if (value !== "sandbox" && value !== "provider_test" && value !== "provider_live") throw new Error("refund_mode_required");
  return value;
}
export interface RefundInput { refundRequestId: string; paymentKey: string; orderId: string; originalAmount: number; points: number; dispatched: boolean; providerSnapshot?: RefundSnapshot | null }
export interface RefundSnapshot { balanceAmount: number; transactionKeys: string[] }
export function refundReason(id: string): string { return `Mirujima refund ${id}`; }
function uncertain(): TossApiError { return new TossApiError("환불 결과 확인이 필요합니다.", "TOSS_REFUND_UNCERTAIN", 502, true); }
function identity(payment: Record<string, unknown>, input: RefundInput): void {
  if (payment.paymentKey !== input.paymentKey || payment.orderId !== input.orderId || payment.totalAmount !== input.originalAmount || payment.currency !== "KRW" || !Number.isSafeInteger(payment.balanceAmount) || Number(payment.balanceAmount) < 0 || Number(payment.balanceAmount) > input.originalAmount) throw uncertain();
}
function preflight(payment: Record<string, unknown>, input: RefundInput): RefundSnapshot {
  identity(payment, input);
  if (!["DONE", "PARTIALLY_CANCELED"].includes(String(payment.status)) || payment.method !== "카드" || Number(payment.balanceAmount) < input.points || (input.points < Number(payment.balanceAmount) && payment.isPartialCancelable !== true)) throw new Error("refund_not_supported");
  const cancels = payment.cancels === null || payment.cancels === undefined ? [] : payment.cancels;
  if (!Array.isArray(cancels)) throw uncertain();
  const transactionKeys: string[] = [];
  for (const cancel of cancels) {
    if (!cancel || typeof cancel !== "object" || cancel.cancelStatus !== "DONE" || typeof cancel.transactionKey !== "string" || !cancel.transactionKey || cancel.transactionKey.length > 64 || cancel.cancelReason === refundReason(input.refundRequestId)) throw uncertain();
    transactionKeys.push(cancel.transactionKey);
  }
  if (new Set(transactionKeys).size !== transactionKeys.length) throw uncertain();
  return { balanceAmount: Number(payment.balanceAmount), transactionKeys };
}
function observed(payment: Record<string, unknown>, input: RefundInput, snapshot: RefundSnapshot, mode: "provider_test" | "provider_live"): Record<string, unknown> {
  identity(payment, input);
  if (!["CANCELED", "PARTIALLY_CANCELED"].includes(String(payment.status)) || !Array.isArray(payment.cancels) || payment.balanceAmount !== snapshot.balanceAmount - input.points) throw uncertain();
  const matches = payment.cancels.filter((cancel: unknown) => cancel && typeof cancel === "object" && Reflect.get(cancel, "cancelReason") === refundReason(input.refundRequestId));
  if (matches.length !== 1) throw uncertain();
  const cancel = matches[0];
  if (cancel.cancelStatus !== "DONE" || cancel.cancelAmount !== input.points || typeof cancel.transactionKey !== "string" || !cancel.transactionKey || cancel.transactionKey.length > 64 || snapshot.transactionKeys.includes(cancel.transactionKey)) throw uncertain();
  return { status: payment.status, paymentKey: input.paymentKey, cancelAmount: input.points, transactionKey: cancel.transactionKey, cancelReason: cancel.cancelReason, refundRequestId: input.refundRequestId, sandbox: false, actualRefund: true, providerMode: mode };
}

// Once dispatch is recorded, retries only query. An unknown outcome never
// releases the wallet reservation or blindly repeats a cancel POST.
export async function recoverableTossRefund(config: TossTestConfig, input: RefundInput, prepare: (snapshot: RefundSnapshot) => Promise<{ canDispatch: boolean; providerSnapshot: RefundSnapshot }>, fetcher: typeof fetch = fetch): Promise<Record<string, unknown>> {
  if (!Number.isSafeInteger(input.points) || input.points <= 0 || !Number.isSafeInteger(input.originalAmount) || input.points > input.originalAmount || !/^[a-f0-9-]{36}$/.test(input.refundRequestId)) throw new Error("invalid refund input");
  const mode = config.secretKey.startsWith("live_sk_") ? "provider_live" : "provider_test";
  const payment = await fetchTossPayment(config, input.paymentKey, fetcher);
  if (input.dispatched) {
    if (!input.providerSnapshot) throw uncertain();
    return observed(payment, input, input.providerSnapshot, mode);
  }
  const prepared = await prepare(preflight(payment, input));
  if (!prepared.canDispatch) return observed(await fetchTossPayment(config, input.paymentKey, fetcher), input, prepared.providerSnapshot, mode);
  try {
    return observed(await cancelTossPayment(config, { paymentKey: input.paymentKey, idempotencyKey: `topup-refund-cancel:${input.refundRequestId}`, cancelReason: refundReason(input.refundRequestId), cancelAmount: input.points }, fetcher), input, prepared.providerSnapshot, mode);
  } catch {
    try { return observed(await fetchTossPayment(config, input.paymentKey, fetcher), input, prepared.providerSnapshot, mode); } catch { throw uncertain(); }
  }
}
