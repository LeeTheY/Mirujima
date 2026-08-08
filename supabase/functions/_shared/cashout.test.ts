import { describe, expect, it } from "vitest";
import { parseCashoutRequest, parseCashoutSettlement } from "./cashout";

describe("cashout sandbox input", () => {
  it("accepts positive integer points with a bounded idempotency key", () => {
    expect(parseCashoutRequest({ points: 3000, idempotencyKey: "cashout-request:1234" }))
      .toEqual({ points: 3000, idempotencyKey: "cashout-request:1234" });
    expect(() => parseCashoutRequest({ points: 1.5, idempotencyKey: "cashout-request:1234" })).toThrow("포인트");
    expect(() => parseCashoutRequest({ points: 0, idempotencyKey: "cashout-request:1234" })).toThrow("포인트");
  });

  it("allows only completed or rejected test outcomes", () => {
    expect(parseCashoutSettlement({ requestId: "11111111-1111-4111-8111-111111111111", outcome: "completed", idempotencyKey: "cashout-complete:1234" }))
      .toEqual({ requestId: "11111111-1111-4111-8111-111111111111", outcome: "completed", idempotencyKey: "cashout-complete:1234" });
    expect(() => parseCashoutSettlement({ requestId: "bad", outcome: "paid", idempotencyKey: "x" })).toThrow("정산 정보");
  });
});
