import { describe, expect, it, vi } from "vitest";
import { newRefundAttempt, persistRefundAttempt, restoreRefundAttempt, parseRefundResult } from "./refund-attempt";
const owner = "11111111-1111-4111-8111-111111111111";
const balances = { topupAvailable: 7000, earnedAvailable: 0, reservedAvailable: 0, cashoutReserved: 0, cashoutCompleted: 0, guardianRewardCompleted: 0 };
const result = { status: "refunded", refundRequestId: owner, points: 3000, sandbox: false, actualRefund: true, balances, maxRefundableTopup: 7000 };
describe("refund request recovery", () => {
  it("persists and restores the same amount and key without provider credentials", () => {
    const active = newRefundAttempt(owner, 3000); let value: string | null = null;
    const storage = { setItem: vi.fn((_key: string, data: string) => { value = data; }), getItem: vi.fn(() => value), removeItem: vi.fn(() => { value = null; }) };
    persistRefundAttempt(storage, owner, active); expect(restoreRefundAttempt(storage, owner)).toEqual(active);
    expect(Object.keys(JSON.parse(value!))).toEqual(["ownerId", "points", "idempotencyKey"]);
    persistRefundAttempt(storage, owner, null); expect(restoreRefundAttempt(storage, owner)).toBeNull();
  });
  it("refuses corrupt, foreign, or invalid amount attempts", () => {
    for (const raw of ["broken", JSON.stringify({ ...newRefundAttempt(owner, 3000), ownerId: "22222222-2222-4222-8222-222222222222" }), JSON.stringify({ ...newRefundAttempt(owner, 3000), points: -1 })]) expect(() => restoreRefundAttempt({ getItem: () => raw }, owner)).toThrow();
    expect(() => newRefundAttempt(owner, 1.5)).toThrow();
  });
  it("distinguishes sandbox from provider cancellation", () => {
    expect(parseRefundResult(result, 3000).actualRefund).toBe(true);
    expect(parseRefundResult({ ...result, sandbox: true, actualRefund: false }, 3000).actualRefund).toBe(false);
  });
  it("accepts a safe preflight rejection and restores the returned wallet balance without provider flags", () => {
    const restored = { ...balances, topupAvailable: 10000 };
    expect(parseRefundResult({ status: "rejected", refundRequestId: owner, points: 3000, balances: restored, maxRefundableTopup: 10000 }, 3000)).toEqual({ status: "rejected", points: 3000, actualRefund: false, balances: restored, maxRefundableTopup: 10000 });
  });
  it.each([{ sandbox: true, actualRefund: true }, { actualRefund: undefined }, { status: "reserved" }, { points: 4000 }])("does not accept an uncertain receipt %j", (changes) => { expect(() => parseRefundResult({ ...result, ...changes }, 3000)).toThrow(); });
  it("preserves a confirmed result when the wallet projection is unavailable", () => {
    expect(parseRefundResult({ ...result, balances: null, maxRefundableTopup: null }, 3000)).toMatchObject({ status: "refunded", balances: null, maxRefundableTopup: null });
  });
});
