import { describe, expect, it } from "vitest";
import { getTossPublicConfig, parsePaymentCallback, paymentFailureCopy } from "./payment";

describe("membership payment UI boundary", () => {
  it("accepts only API individual Toss test client keys", () => {
    expect(getTossPublicConfig({
      NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_ck_example",
      NEXT_PUBLIC_APP_ORIGIN: "http://localhost:3000"
    })).toEqual({ clientKey: "test_ck_example", appOrigin: "http://localhost:3000" });
    expect(() => getTossPublicConfig({
      NEXT_PUBLIC_TOSS_CLIENT_KEY: "live_ck_example",
      NEXT_PUBLIC_APP_ORIGIN: "http://localhost:3000"
    })).toThrow("테스트 client key");
    expect(() => getTossPublicConfig({
      NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_gck_example",
      NEXT_PUBLIC_APP_ORIGIN: "http://localhost:3000"
    })).toThrow("테스트 client key");
  });

  it("parses only the fixed Premium callback amount", () => {
    expect(parsePaymentCallback(new URLSearchParams("paymentKey=payment_1&orderId=membership_order_1&amount=12900")))
      .toEqual({ paymentKey: "payment_1", orderId: "membership_order_1", amount: 12900 });
    expect(() => parsePaymentCallback(new URLSearchParams("paymentKey=p&orderId=o&amount=1"))).toThrow("결제 결과");
  });

  it("does not expose raw provider messages", () => {
    expect(paymentFailureCopy("PAY_PROCESS_CANCELED")).toContain("취소");
    expect(paymentFailureCopy("UNKNOWN_PROVIDER_MESSAGE")).toBe("결제를 완료하지 못했습니다. 다시 시도해 주세요.");
  });
});
