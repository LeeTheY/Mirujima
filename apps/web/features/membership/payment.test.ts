import { describe, expect, it } from "vitest";
import { confirmationFailureCopy, getTossPublicConfig, parsePaymentCallback, paymentFailureCopy, readFunctionErrorCode } from "./payment";

describe("membership payment UI boundary", () => {
  it("requires an explicit live mode and HTTPS for a live client key", () => {
    expect(getTossPublicConfig({ NEXT_PUBLIC_TOSS_PAYMENT_MODE: "live", NEXT_PUBLIC_TOSS_CLIENT_KEY: "live_ck_example", NEXT_PUBLIC_APP_ORIGIN: "https://mirujima.vercel.app" }).clientKey).toBe("live_ck_example");
    expect(() => getTossPublicConfig({ NEXT_PUBLIC_TOSS_PAYMENT_MODE: "live", NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_ck_example", NEXT_PUBLIC_APP_ORIGIN: "https://mirujima.vercel.app" })).toThrow();
    expect(() => getTossPublicConfig({ NEXT_PUBLIC_TOSS_PAYMENT_MODE: "live", NEXT_PUBLIC_TOSS_CLIENT_KEY: "live_ck_example", NEXT_PUBLIC_APP_ORIGIN: "http://localhost:3000" })).toThrow();
  });
  it("accepts only API individual Toss test client keys", () => {
    expect(getTossPublicConfig({
      NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_ck_example",
      NEXT_PUBLIC_APP_ORIGIN: "http://localhost:3000"
    })).toEqual({ clientKey: "test_ck_example", appOrigin: "http://localhost:3000" });
    expect(() => getTossPublicConfig({
      NEXT_PUBLIC_TOSS_CLIENT_KEY: "live_ck_example",
      NEXT_PUBLIC_APP_ORIGIN: "http://localhost:3000"
    })).toThrow("결제 서비스를 준비 중");
    expect(() => getTossPublicConfig({
      NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_gck_example",
      NEXT_PUBLIC_APP_ORIGIN: "http://localhost:3000"
    })).toThrow("결제 서비스를 준비 중");
  });

  it("parses server-verifiable role and seat callback amounts", () => {
    expect(parsePaymentCallback(new URLSearchParams("paymentKey=payment_1&orderId=membership_order_1&amount=12900")))
      .toEqual({ paymentKey: "payment_1", orderId: "membership_order_1", amount: 12900 });
    expect(parsePaymentCallback(new URLSearchParams("paymentKey=payment_2&orderId=membership_order_2&amount=9900")).amount).toBe(9900);
    expect(parsePaymentCallback(new URLSearchParams("paymentKey=payment_3&orderId=membership_order_3&amount=1950")).amount).toBe(1950);
    expect(() => parsePaymentCallback(new URLSearchParams("paymentKey=p&orderId=o&amount=1"))).toThrow("결제 결과");
  });

  it("does not expose raw provider messages", () => {
    expect(paymentFailureCopy("PAY_PROCESS_CANCELED")).toContain("취소");
    expect(paymentFailureCopy("UNKNOWN_PROVIDER_MESSAGE")).toBe("결제를 완료하지 못했습니다. 다시 시도해 주세요.");
  });

  it("separates retryable, amount mismatch, and rejected confirmation copy", async () => {
    expect(confirmationFailureCopy("topup", "payment_temporarily_unavailable")).toContain("같은 결과 주소");
    expect(confirmationFailureCopy("topup", "payment_temporarily_unavailable")).not.toContain("잔액은 변경되지 않았습니다");
    expect(confirmationFailureCopy("topup", "unknown")).not.toContain("잔액은 변경되지 않았습니다");
    expect(confirmationFailureCopy("membership", "payment_temporarily_unavailable")).not.toContain("멤버십은 변경되지 않았습니다");
    expect(confirmationFailureCopy("membership", "membership_payment_amount_mismatch")).toContain("일치하지 않습니다");
    expect(confirmationFailureCopy("topup", "payment_rejected")).toContain("잔액은 변경되지 않았습니다");
    expect(await readFunctionErrorCode({ context: { json: async () => ({ error: "payment_temporarily_unavailable" }) } }))
      .toBe("payment_temporarily_unavailable");
  });
});
