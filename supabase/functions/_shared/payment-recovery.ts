import { confirmTossPayment, fetchTossPayment, TossApiError, type TossPaymentInput, type TossTestConfig, type SanitizedTossPayment } from "./toss.ts";

function validateIdentity(payment: Record<string, unknown>, expected: TossPaymentInput): void {
  if (payment.paymentKey !== expected.paymentKey || payment.orderId !== expected.orderId || payment.totalAmount !== expected.amount || (payment.currency !== undefined && payment.currency !== "KRW")) {
    throw new TossApiError("결제 조회 결과를 확인하지 못했습니다.", "TOSS_RESPONSE_MISMATCH", 502, true);
  }
}
function observedPayment(payment: Record<string, unknown>, expected: TossPaymentInput): SanitizedTossPayment | null {
  validateIdentity(payment, expected);
  if (payment.status === "DONE") {
    if (payment.balanceAmount !== undefined && payment.balanceAmount !== expected.amount) throw new TossApiError("결제 금액 확인이 필요합니다.", "TOSS_PAYMENT_REQUIRES_REVIEW", 502, true);
    return { status: "DONE", method: typeof payment.method === "string" ? payment.method : null, approvedAt: typeof payment.approvedAt === "string" ? payment.approvedAt : null, transactionKey: typeof payment.lastTransactionKey === "string" ? payment.lastTransactionKey : typeof payment.transactionKey === "string" ? payment.transactionKey : null };
  }
  if (payment.status === "ABORTED" || payment.status === "EXPIRED") throw new TossApiError("결제가 종료되었습니다.", `TOSS_PAYMENT_${payment.status}`, 400, false);
  if (payment.status !== "IN_PROGRESS") throw new TossApiError("결제 상태 확인이 필요합니다.", "TOSS_PAYMENT_REQUIRES_REVIEW", 502, true);
  return null;
}

export function isObservedTerminalPayment(error: unknown): error is TossApiError {
  return error instanceof TossApiError && ["TOSS_PAYMENT_ABORTED", "TOSS_PAYMENT_EXPIRED"].includes(error.code);
}

// A fresh claim may confirm once. A retry queries first; all confirm attempts
// retain the original provider idempotency key. Failed legacy orders can only
// reconcile a verified DONE payment and never issue another confirmation.
export async function recoverableTossConfirmation(config: TossTestConfig, input: TossPaymentInput, options: { reconcileFirst: boolean; reconciliationOnly?: boolean }, fetcher: typeof fetch = fetch): Promise<SanitizedTossPayment> {
  if (options.reconcileFirst || options.reconciliationOnly) {
    const observed = observedPayment(await fetchTossPayment(config, input.paymentKey, fetcher), input);
    if (observed) return observed;
    if (options.reconciliationOnly) throw new TossApiError("기존 결제 결과 확인이 필요합니다.", "TOSS_PAYMENT_REQUIRES_REVIEW", 502, true);
  }
  try {
    return await confirmTossPayment(config, input, fetcher);
  } catch (cause) {
    // Even a 400 may mean already approved. Do not fail a ledger order merely
    // because an approval response was lost or an API/configuration failed.
    try {
      const observed = observedPayment(await fetchTossPayment(config, input.paymentKey, fetcher), input);
      if (observed) return observed;
    } catch (queryError) {
      if (isObservedTerminalPayment(queryError)) throw queryError;
    }
    if (isObservedTerminalPayment(cause)) throw cause;
    throw new TossApiError("결제 승인 결과를 확인하지 못했습니다.", "TOSS_CONFIRMATION_UNCERTAIN", 502, true);
  }
}
