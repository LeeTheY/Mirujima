export interface TossPublicConfig {
  clientKey: string;
  appOrigin: string;
}

export interface PaymentCallback {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export function getTossPublicConfig(env: Record<string, string | undefined> = {
  NEXT_PUBLIC_TOSS_CLIENT_KEY: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
  NEXT_PUBLIC_APP_ORIGIN: process.env.NEXT_PUBLIC_APP_ORIGIN
}): TossPublicConfig {
  const clientKey = env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ?? "";
  if (!clientKey.startsWith("test_ck_")) throw new Error("Toss API 개별 연동 테스트 client key가 필요합니다.");
  const rawOrigin = env.NEXT_PUBLIC_APP_ORIGIN?.trim() ?? "";
  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new Error("Web 앱 origin이 올바르지 않습니다.");
  }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== rawOrigin.replace(/\/$/, "")) {
    throw new Error("Web 앱 origin이 올바르지 않습니다.");
  }
  return { clientKey, appOrigin: origin.origin };
}

export function parsePaymentCallback(params: URLSearchParams): PaymentCallback {
  const paymentKey = params.get("paymentKey")?.trim() ?? "";
  const orderId = params.get("orderId")?.trim() ?? "";
  const amount = Number(params.get("amount"));
  if (paymentKey.length < 6 || paymentKey.length > 200
    || !/^[A-Za-z0-9_-]{6,64}$/.test(orderId)
    || !Number.isSafeInteger(amount) || amount < 500 || amount > 24_600) {
    throw new Error("결제 결과가 올바르지 않습니다.");
  }
  return { paymentKey, orderId, amount };
}

export function paymentFailureCopy(code: string | null): string {
  if (code === "PAY_PROCESS_CANCELED") return "결제가 취소되었습니다. 멤버십은 변경되지 않았습니다.";
  if (code === "PAY_PROCESS_ABORTED") return "결제 인증을 완료하지 못했습니다. 다시 시도해 주세요.";
  if (code === "REJECT_CARD_COMPANY") return "카드사에서 결제를 거절했습니다. 다른 테스트 수단을 선택해 주세요.";
  return "결제를 완료하지 못했습니다. 다시 시도해 주세요.";
}
