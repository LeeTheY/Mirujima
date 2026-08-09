import { describe, expect, it } from "vitest";
import { cashoutErrorCopy, cashoutFullAmount, parseCashoutPoints } from "./cashout";

describe("cashout form domain", () => {
  it("accepts only available positive integer earned points", () => {
    expect(parseCashoutPoints("3000", 7000)).toBe(3000);
    expect(() => parseCashoutPoints("0", 7000)).toThrow("1P");
    expect(() => parseCashoutPoints("1.5", 7000)).toThrow("정수");
    expect(() => parseCashoutPoints("7001", 7000)).toThrow("잔액");
  });

  it("maps stable server codes to safe Korean copy", () => {
    expect(cashoutErrorCopy("insufficient_earned_points")).toContain("잔액");
    expect(cashoutErrorCopy("raw database secret error")).toBe("현금화 요청을 처리하지 못했습니다. 다시 시도해 주세요.");
  });

  it("selects the complete positive earned balance", () => {
    expect(cashoutFullAmount(12_345)).toBe("12345");
    expect(() => cashoutFullAmount(0)).toThrow("환급 가능");
    expect(() => cashoutFullAmount(-1)).toThrow("환급 가능");
  });
});
