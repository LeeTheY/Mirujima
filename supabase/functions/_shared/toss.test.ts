import { describe, expect, it, vi } from "vitest";
import {
  assertTossTestMode,
  assertSandboxTestMode,
  confirmTossPayment,
  fetchTossPayment,
  parseMembershipConfirmationRequest,
  parseMembershipOrderRequest,
  parseTopupConfirmationRequest,
  parseTopupOrderRequest,
  PREMIUM_PRICE_KRW
} from "./toss";

describe("Toss test payment boundary", () => {
  it("accepts only fixed wallet topup requests", () => {
    expect(parseTopupOrderRequest({ points: 10000, idempotencyKey: "topup-order:123" }))
      .toEqual({ points: 10000, idempotencyKey: "topup-order:123" });
    expect(parseTopupOrderRequest({ points: 300000, idempotencyKey: "topup-order:300k" }).points).toBe(300000);
    expect(() => parseTopupOrderRequest({ points: 200000, idempotencyKey: "topup-order:200k" })).toThrow("충전 금액");
    expect(() => parseTopupOrderRequest({ points: 20000, idempotencyKey: "topup-order:123" })).toThrow("충전 금액");
    expect(parseTopupConfirmationRequest({ paymentKey: "payment_123", orderId: "mirujima_topup_123", amount: 150000 }).amount).toBe(150000);
  });

  it("allows non-provider cashout simulation without a Toss secret", () => {
    expect(assertSandboxTestMode({ TOSS_PAYMENT_MODE: "test" })).toBeUndefined();
    expect(() => assertSandboxTestMode({ TOSS_PAYMENT_MODE: "live" })).toThrow("테스트 모드");
  });
  it("accepts only bounded membership request identifiers", () => {
    expect(parseMembershipOrderRequest({ idempotencyKey: "membership-idem-123" }))
      .toEqual({ idempotencyKey: "membership-idem-123" });
    expect(parseMembershipConfirmationRequest({
      paymentKey: "payment_key_123",
      orderId: "membership_order_123",
      amount: 12900
    })).toEqual({ paymentKey: "payment_key_123", orderId: "membership_order_123", amount: 12900 });
    expect(() => parseMembershipConfirmationRequest({ paymentKey: "x", orderId: "bad order", amount: 1 })).toThrow("결제 승인 정보");
  });

  it("accepts only API individual test secret keys in explicit test mode", () => {
    expect(assertTossTestMode({ TOSS_PAYMENT_MODE: "test", TOSS_SECRET_KEY: "test_sk_example" }))
      .toEqual({ secretKey: "test_sk_example" });
    expect(() => assertTossTestMode({ TOSS_PAYMENT_MODE: "live", TOSS_SECRET_KEY: "test_sk_example" })).toThrow("테스트 모드");
    expect(() => assertTossTestMode({ TOSS_PAYMENT_MODE: "test", TOSS_SECRET_KEY: "live_sk_example" })).toThrow("테스트 secret");
    expect(() => assertTossTestMode({ TOSS_PAYMENT_MODE: "test", TOSS_SECRET_KEY: "test_gsk_example" })).toThrow("테스트 secret");
  });

  it("confirms the fixed Premium amount with a stable idempotency key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      status: "DONE",
      orderId: "membership_order_1",
      paymentKey: "payment_key_1",
      totalAmount: PREMIUM_PRICE_KRW,
      method: "카드",
      approvedAt: "2026-08-09T00:00:00+09:00",
      transactionKey: "transaction_1"
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await confirmTossPayment(
      { secretKey: "test_sk_example" },
      { paymentKey: "payment_key_1", orderId: "membership_order_1", amount: PREMIUM_PRICE_KRW, idempotencyKey: "membership-idem-1" },
      fetcher
    );

    expect(result).toEqual({
      status: "DONE",
      method: "카드",
      approvedAt: "2026-08-09T00:00:00+09:00",
      transactionKey: "transaction_1"
    });
    expect(fetcher).toHaveBeenCalledWith("https://api.tosspayments.com/v1/payments/confirm", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "Idempotency-Key": "membership-idem-1" })
    }));
  });

  it("rejects mismatched or incomplete provider responses", async () => {
    const mismatched = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      status: "DONE", orderId: "other", paymentKey: "payment_key_1", totalAmount: PREMIUM_PRICE_KRW
    }), { status: 200 }));
    await expect(confirmTossPayment(
      { secretKey: "test_sk_example" },
      { paymentKey: "payment_key_1", orderId: "membership_order_1", amount: PREMIUM_PRICE_KRW, idempotencyKey: "membership-idem-1" },
      mismatched
    )).rejects.toThrow("응답 검증");
  });

  it("queries an existing payment without exposing credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      status: "DONE", orderId: "membership_order_1", paymentKey: "payment_key_1", totalAmount: PREMIUM_PRICE_KRW
    }), { status: 200 }));
    await fetchTossPayment({ secretKey: "test_sk_example" }, "payment_key_1", fetcher);
    const [, init] = fetcher.mock.calls[0];
    expect(init?.headers).toEqual(expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }));
    expect(JSON.stringify(init)).not.toContain("test_sk_example");
  });
});
