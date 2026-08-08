export const PREMIUM_PRICE_KRW = 12_900;

export interface TossTestConfig {
  secretKey: string;
}

export interface TossPaymentInput {
  paymentKey: string;
  orderId: string;
  amount: number;
  idempotencyKey: string;
}

export interface MembershipConfirmationRequest {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export interface SanitizedTossPayment {
  status: "DONE";
  method: string | null;
  approvedAt: string | null;
  transactionKey: string | null;
}

export class TossApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = "TossApiError";
  }
}

export function parseMembershipOrderRequest(value: unknown): { idempotencyKey: string } {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey)) throw new Error("주문 요청 식별자가 올바르지 않습니다.");
  return { idempotencyKey };
}

export function parseMembershipConfirmationRequest(value: unknown): MembershipConfirmationRequest {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const paymentKey = typeof input.paymentKey === "string" ? input.paymentKey.trim() : "";
  const orderId = typeof input.orderId === "string" ? input.orderId.trim() : "";
  const amount = input.amount;
  if (paymentKey.length < 6 || paymentKey.length > 200
    || !/^[A-Za-z0-9_-]{6,64}$/.test(orderId)
    || amount !== PREMIUM_PRICE_KRW) {
    throw new Error("결제 승인 정보가 올바르지 않습니다.");
  }
  return { paymentKey, orderId, amount: PREMIUM_PRICE_KRW };
}

export function assertTossTestMode(env: Record<string, string | undefined>): TossTestConfig {
  if (env.TOSS_PAYMENT_MODE !== "test") throw new Error("Toss 테스트 모드가 아닙니다.");
  const secretKey = env.TOSS_SECRET_KEY?.trim();
  if (!secretKey?.startsWith("test_sk_")) throw new Error("Toss API 개별 연동 테스트 secret이 필요합니다.");
  return { secretKey };
}

function authorization(secretKey: string): string {
  return `Basic ${btoa(`${secretKey}:`)}`;
}

async function tossRequest(
  config: TossTestConfig,
  url: string,
  init: RequestInit,
  fetcher: typeof fetch
): Promise<Record<string, unknown>> {
  const response = await fetcher(url, {
    ...init,
    headers: {
      Authorization: authorization(config.secretKey),
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const code = typeof payload.code === "string" ? payload.code : "TOSS_API_ERROR";
    throw new TossApiError("Toss 결제를 처리하지 못했습니다.", code, response.status, response.status >= 500);
  }
  return payload;
}

function sanitizedPayment(payload: Record<string, unknown>, expected: TossPaymentInput): SanitizedTossPayment {
  if (payload.status !== "DONE"
    || payload.orderId !== expected.orderId
    || payload.paymentKey !== expected.paymentKey
    || payload.totalAmount !== expected.amount) {
    throw new Error("Toss 결제 응답 검증에 실패했습니다.");
  }
  return {
    status: "DONE",
    method: typeof payload.method === "string" ? payload.method : null,
    approvedAt: typeof payload.approvedAt === "string" ? payload.approvedAt : null,
    transactionKey: typeof payload.transactionKey === "string" ? payload.transactionKey : null
  };
}

export async function confirmTossPayment(
  config: TossTestConfig,
  input: TossPaymentInput,
  fetcher: typeof fetch = fetch
): Promise<SanitizedTossPayment> {
  if (input.amount !== PREMIUM_PRICE_KRW) throw new Error("Premium 결제 금액이 올바르지 않습니다.");
  const payload = await tossRequest(config, "https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({ paymentKey: input.paymentKey, orderId: input.orderId, amount: input.amount })
  }, fetcher);
  return sanitizedPayment(payload, input);
}

export async function fetchTossPayment(
  config: TossTestConfig,
  paymentKey: string,
  fetcher: typeof fetch = fetch
): Promise<Record<string, unknown>> {
  if (!paymentKey || paymentKey.length > 200) throw new Error("결제 키가 올바르지 않습니다.");
  return tossRequest(
    config,
    `https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}`,
    { method: "GET" },
    fetcher
  );
}
