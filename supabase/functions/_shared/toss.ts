export const STUDENT_PREMIUM_PRICE_KRW = 9_900;
export const GUARDIAN_FAMILY_PRICE_KRW = 12_900;
export const PREMIUM_PRICE_KRW = GUARDIAN_FAMILY_PRICE_KRW;

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

export function parseMembershipOrderRequest(value: unknown): { idempotencyKey: string; orderKind: "membership" | "family_seat" } {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey)) throw new Error("주문 요청 식별자가 올바르지 않습니다.");
  const orderKind = input.orderKind === "family_seat" ? "family_seat" : "membership";
  return { idempotencyKey, orderKind };
}

export function parseMembershipConfirmationRequest(value: unknown): MembershipConfirmationRequest {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const paymentKey = typeof input.paymentKey === "string" ? input.paymentKey.trim() : "";
  const orderId = typeof input.orderId === "string" ? input.orderId.trim() : "";
  const amount = input.amount;
  if (paymentKey.length < 6 || paymentKey.length > 200
    || !/^[A-Za-z0-9_-]{6,64}$/.test(orderId)
    || typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 500 || amount > 24_600) {
    throw new Error("결제 승인 정보가 올바르지 않습니다.");
  }
  return { paymentKey, orderId, amount };
}

export function assertTossTestMode(env: Record<string, string | undefined>): TossTestConfig {
  if (env.TOSS_PAYMENT_MODE !== "test") throw new Error("Toss 테스트 모드가 아닙니다.");
  const secretKey = env.TOSS_SECRET_KEY?.trim();
  if (!secretKey?.startsWith("test_sk_")) throw new Error("Toss API 개별 연동 테스트 secret이 필요합니다.");
  return { secretKey };
}

export function assertSandboxTestMode(env: Record<string, string | undefined>): void {
  if (env.TOSS_PAYMENT_MODE !== "test") throw new Error("Toss 테스트 모드가 아닙니다.");
}

const TOPUP_PRESETS = [10_000, 30_000, 50_000, 100_000, 150_000, 300_000];
export function parseTopupOrderRequest(value: unknown): { points: number; idempotencyKey: string } {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const points = input.points;
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  if (typeof points !== "number" || !TOPUP_PRESETS.includes(points)) throw new Error("충전 금액이 올바르지 않습니다.");
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey)) throw new Error("주문 요청 식별자가 올바르지 않습니다.");
  return { points, idempotencyKey };
}

export function parseTopupConfirmationRequest(value: unknown): MembershipConfirmationRequest {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const paymentKey = typeof input.paymentKey === "string" ? input.paymentKey.trim() : "";
  const orderId = typeof input.orderId === "string" ? input.orderId.trim() : "";
  const amount = input.amount;
  if (paymentKey.length < 6 || paymentKey.length > 200 || !/^[A-Za-z0-9_-]{6,64}$/.test(orderId)
    || typeof amount !== "number" || !TOPUP_PRESETS.includes(amount)) throw new Error("충전 승인 정보가 올바르지 않습니다.");
  return { paymentKey, orderId, amount };
}

export function sandboxRefundPayload(paymentKey: string, cancelAmount: number, now = new Date()): Record<string, unknown> {
  if (!paymentKey || paymentKey.length > 200) throw new Error("결제 키가 올바르지 않습니다.");
  if (!Number.isSafeInteger(cancelAmount) || cancelAmount <= 0) throw new Error("환불 금액이 올바르지 않습니다.");
  return {
    status: "CANCELED",
    paymentKey,
    cancelAmount,
    canceledAt: now.toISOString(),
    sandbox: true,
    actualRefund: false,
  };
}

export function parseTopupRefundRequest(value: unknown): { idempotencyKey: string; points: number } {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey)) throw new Error("환불 요청 식별자가 올바르지 않습니다.");
  if (typeof input.points !== "number" || !Number.isSafeInteger(input.points) || input.points <= 0 || input.points > 300_000) {
    throw new Error("환불 금액이 올바르지 않습니다.");
  }
  return { idempotencyKey, points: input.points };
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
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(10_000),
      headers: {
        Authorization: authorization(config.secretKey),
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      }
    });
  } catch {
    throw new TossApiError("Toss 결제를 처리하지 못했습니다.", "TOSS_NETWORK_ERROR", 503, true);
  }
  let payload: Record<string, unknown>;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    throw new TossApiError("Toss 결제를 처리하지 못했습니다.", "TOSS_INVALID_RESPONSE", 502, true);
  }
  if (!response.ok) {
    const code = typeof payload.code === "string" ? payload.code : "TOSS_API_ERROR";
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new TossApiError("Toss 결제를 처리하지 못했습니다.", code, response.status, retryable);
  }
  return payload;
}

function sanitizedPayment(payload: Record<string, unknown>, expected: TossPaymentInput): SanitizedTossPayment {
  if (payload.status !== "DONE"
    || payload.orderId !== expected.orderId
    || payload.paymentKey !== expected.paymentKey
    || payload.totalAmount !== expected.amount) {
    throw new TossApiError("Toss 결제 응답 검증에 실패했습니다.", "TOSS_RESPONSE_MISMATCH", 502, true);
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
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error("결제 금액이 올바르지 않습니다.");
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

export async function cancelTossPayment(
  config: TossTestConfig,
  input: { paymentKey: string; idempotencyKey: string; cancelReason: string },
  fetcher: typeof fetch = fetch
): Promise<Record<string, unknown>> {
  if (!input.paymentKey || input.paymentKey.length > 200) throw new Error("결제 키가 올바르지 않습니다.");
  if (input.cancelReason.length < 1 || input.cancelReason.length > 200) throw new Error("취소 사유가 올바르지 않습니다.");
  const payload = await tossRequest(
    config,
    `https://api.tosspayments.com/v1/payments/${encodeURIComponent(input.paymentKey)}/cancel`,
    {
      method: "POST",
      headers: { "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({ cancelReason: input.cancelReason }),
    },
    fetcher
  );
  if (payload.paymentKey !== input.paymentKey || payload.status !== "CANCELED") {
    throw new TossApiError("Toss 환불 응답 검증에 실패했습니다.", "TOSS_RESPONSE_MISMATCH", 502, true);
  }
  return payload;
}
