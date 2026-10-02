import { describe, expect, it, vi } from "vitest";
import { newMembershipAttempt, restoreMembershipAttempt, persistMembershipAttempt, parseMembershipOrder, confirmedMembershipOrder } from "./checkout-attempt";
const owner = "11111111-1111-4111-8111-111111111111";
const pending = { orderId: "membership_fixture", amount: 9900, orderName: "학생 이용권", productCode: "student_premium", orderKind: "membership", status: "pending" };
describe("membership checkout recovery", () => {
  it("restores the same key and kind after a lost order response", () => {
    let raw: string | null = null; const storage = { getItem: vi.fn(() => raw), setItem: vi.fn((_key: string, value: string) => { raw = value; }), removeItem: vi.fn(() => { raw = null; }) };
    const attempt = newMembershipAttempt(owner, "membership"); persistMembershipAttempt(storage, owner, attempt);
    expect(restoreMembershipAttempt(storage, owner)).toEqual(attempt); expect(Object.keys(JSON.parse(raw!))).toEqual(["ownerId", "orderKind", "idempotencyKey", "orderId", "amount"]);
    persistMembershipAttempt(storage, owner, null); expect(restoreMembershipAttempt(storage, owner)).toBeNull();
  });
  it("locks the original quoted amount for prorated family seats", () => {
    const attempt = { ...newMembershipAttempt(owner, "family_seat"), orderId: "seat_fixture", amount: 500 };
    const order = { ...pending, orderId: "seat_fixture", amount: 500, productCode: "guardian_family", orderKind: "family_seat" };
    expect(parseMembershipOrder(order, attempt, "guardian").amount).toBe(500);
    expect(() => parseMembershipOrder({ ...order, amount: 600 }, attempt, "guardian")).toThrow();
  });
  it.each([{ status: undefined }, { orderId: "bad order" }, { productCode: "guardian_family" }, { orderKind: "family_seat" }, { amount: 12900 }])("rejects an inconsistent canonical order %j", (changes) => { expect(() => parseMembershipOrder({ ...pending, ...changes }, newMembershipAttempt(owner, "membership"), "student")).toThrow(); });
  it("rejects foreign, corrupt and partially persisted attempts", () => {
    for (const value of ["broken", JSON.stringify({ ...newMembershipAttempt(owner, "membership"), ownerId: "22222222-2222-4222-8222-222222222222" }), JSON.stringify({ ...newMembershipAttempt(owner, "membership"), amount: 9900 })]) expect(() => restoreMembershipAttempt({ getItem: () => value }, owner)).toThrow();
  });
  it("requires a matching confirmed order, even if current membership is expired", () => {
    const order = { orderId: pending.orderId, amount: 9900, orderKind: "membership" as const };
    expect(confirmedMembershipOrder({ status: "inactive", paymentOrder: { ...order, status: "confirmed" } }, order)).toBe(true);
    expect(confirmedMembershipOrder({ status: "active" }, order)).toBe(false);
    expect(confirmedMembershipOrder({ status: "active", paymentOrder: { ...order, orderId: "foreign", status: "confirmed" } }, order)).toBe(false);
  });
});
