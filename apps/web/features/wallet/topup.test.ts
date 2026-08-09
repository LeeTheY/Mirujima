import { describe, expect, it } from "vitest";
import { TOPUP_PRESETS, parseTopupCallback, parseTopupOrder, selectTopupPreset, topupFailureCopy } from "./topup";

describe("wallet topup domain", () => {
  it("offers only the approved presets", () => expect(TOPUP_PRESETS).toEqual([10_000, 30_000, 50_000, 100_000, 150_000, 300_000]));
  it("validates server orders", () => {
    expect(parseTopupOrder({ orderId: "mirujima_topup_123456", amount: 30_000, points: 30_000, orderName: "Mirujima 30,000P 충전" }).amount).toBe(30_000);
    expect(() => parseTopupOrder({ orderId: "bad", amount: 20_000, points: 20_000, orderName: "bad" })).toThrow("충전 주문");
  });
  it("validates callbacks and selection", () => {
    expect(parseTopupCallback(new URLSearchParams("paymentKey=payment_123&orderId=mirujima_topup_123456&amount=50000")).amount).toBe(50_000);
    expect(selectTopupPreset(30_000)).toBe(30_000);
    expect(selectTopupPreset(300_000)).toBe(300_000);
    expect(() => selectTopupPreset(200_000)).toThrow("충전 금액");
    expect(() => selectTopupPreset(20_000)).toThrow("충전 금액");
  });
  it("uses safe failure copy", () => {
    expect(topupFailureCopy("PAY_PROCESS_CANCELED")).toContain("취소");
    expect(topupFailureCopy("raw")).toBe("포인트 충전을 완료하지 못했습니다. 다시 시도해 주세요.");
  });
});
