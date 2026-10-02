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
  NEXT_PUBLIC_TOSS_PAYMENT_MODE: process.env.NEXT_PUBLIC_TOSS_PAYMENT_MODE,
  NEXT_PUBLIC_APP_ORIGIN: process.env.NEXT_PUBLIC_APP_ORIGIN
}): TossPublicConfig {
  const clientKey = env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ?? "";
  const mode = env.NEXT_PUBLIC_TOSS_PAYMENT_MODE ?? "test";
  if (!["test", "live"].includes(mode) || !new RegExp(`^${mode}_ck_[A-Za-z0-9_-]+$`).test(clientKey)) throw new Error("결제 서비스를 준비 중입니다. 잠시 후 다시 시도해 주세요.");
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
  if (mode === "live" && origin.protocol !== "https:") throw new Error("결제 서비스를 준비 중입니다. 잠시 후 다시 시도해 주세요.");
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
  if (code === "REJECT_CARD_COMPANY") return "카드사에서 결제를 거절했습니다. 다른 결제수단을 선택해 주세요.";
  return "결제를 완료하지 못했습니다. 다시 시도해 주세요.";
}

export async function readFunctionErrorCode(error: unknown): Promise<string> {
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

export function confirmationFailureCopy(kind: "membership" | "topup", code: string): string {
  const unchanged = kind === "membership" ? "멤버십은 변경되지 않았습니다." : "포인트 잔액은 변경되지 않았습니다.";
  if (code === "payment_temporarily_unavailable" || code === "unknown" || code === "topup_confirmation_failed" || code === "membership_confirmation_failed") return kind === "topup"
    ? "결제 결과를 확인하지 못했습니다. 잠시 뒤 같은 결과 주소에서 다시 확인하고 충전 내역과 잔액을 조회해 주세요."
    : "결제 결과를 확인하지 못했습니다. 잠시 뒤 같은 결과 주소에서 다시 확인하고 멤버십 상태를 조회해 주세요.";
  if (code === "membership_payment_amount_mismatch" || code === "topup_payment_amount_mismatch") {
    return `주문 금액과 결제 결과 금액이 일치하지 않습니다. ${unchanged}`;
  }
  if (code === "topup_payment_conflict") return `이미 다른 주문에서 사용된 결제 정보입니다. ${unchanged}`;
  if (code === "payment_rejected") return `결제가 승인되지 않았습니다. ${unchanged}`;
  return "결제 승인을 확인하지 못했습니다. 기존 결제 결과 주소와 이용 상태를 다시 확인해 주세요.";
}
