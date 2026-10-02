import { describe, expect, it } from "vitest";
import { parseTopupHistory, topupHistoryLabel, TOPUP_HISTORY_COLUMNS } from "./topup-history";
const user = "11111111-1111-4111-8111-111111111111";
const request = { id: "22222222-2222-4222-8222-222222222222", points: 10000, krw_amount: 10000, created_at: "2026-10-02T00:00:00Z", provider: "toss", kind: "topup_requested", status: "confirming", provider_order_id: "order-123", related_transaction_id: null, from_user_id: null, to_user_id: user };
describe("topup history projection", () => {
  it("keeps pending orders separate from posted credits", () => {
    const items = parseTopupHistory([request], user)!;
    expect(topupHistoryLabel(items[0])).toContain("결과 미확정");
  });
  it("collapses an order only when its settlement is posted", () => {
    const confirmation = { ...request, id: "33333333-3333-4333-8333-333333333333", kind: "topup_confirmed", status: "posted", related_transaction_id: request.id };
    expect(parseTopupHistory([confirmation, request], user)).toHaveLength(1);
    expect(parseTopupHistory([{ ...confirmation, status: "pending" }, request], user)).toHaveLength(2);
  });
  it("does not call a posted refund reservation a completed refund", () => {
    expect(topupHistoryLabel(parseTopupHistory([{ ...request, kind: "topup_refund_requested", status: "posted" }], user)![0])).toContain("처리 중");
  });
  it.each([{ ...request, points: "10000" }, { ...request, points: 0 }, { ...request, status: "confirmed" }, { ...request, to_user_id: "44444444-4444-4444-8444-444444444444" }])("rejects invalid or foreign ledger rows", (row) => {
    expect(parseTopupHistory([row], user)).toBeNull();
  });
  it("distinguishes a true empty list from an unavailable response", () => {
    expect(parseTopupHistory([], user)).toEqual([]);
    expect(parseTopupHistory(null, user)).toBeNull();
  });
  it("never selects provider keys or metadata", () => {
    expect(TOPUP_HISTORY_COLUMNS).not.toMatch(/payment_key|metadata/);
  });
});
