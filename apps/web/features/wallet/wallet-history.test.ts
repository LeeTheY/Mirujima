import { describe, expect, it, vi } from "vitest";
import { parseWalletHistory, walletHistoryMovement, walletHistoryReason, walletHistoryStatus, walletHistoryTitle, walletRowBefore, type WalletHistoryItem } from "./wallet-history";
import { loadWalletHistory } from "./wallet-history-data";
const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const row: WalletHistoryItem = { id, kind: "self_deposit_reserved", status: "posted", points: 2000, krwAmount: null, createdAt: "2026-10-02T01:00:00.123456+00:00", scheduleId: "plan-a", sessionId: "session-a", relatedTransactionId: null, orderId: null, fromBucket: "topup", toBucket: "reserved", provider: null, resolutionKind: null, resolutionTransactionId: null, reasonCode: null };
const page = { ownerUserId: owner, items: [row], hasMore: false, nextCursor: null, checkedAt: "2026-10-02T01:00:01Z" };
describe("wallet history boundary", () => {
  it("preserves ledger reservation and reference details without treating them as earnings", () => {
    expect(parseWalletHistory(page, owner)).toEqual(page);
    expect(walletHistoryStatus(row)).toBe("예약 중 · 정산 대기");
    expect(walletHistoryMovement(row)).toBe("충전 포인트 → 집중·보상 예약");
    expect(walletHistoryTitle(row)).toBe("집중 디파짓 예약");
  });
  it.each(["topup_requested", "topup_refund_requested", "guardian_reward_requested", "cashout_requested"] as const)("keeps %s processing even when the request ledger is posted", (kind) => {
    expect(walletHistoryStatus({ ...row, kind })).toContain("처리 중");
  });
  it("reports a linked settlement on the original reservation", () => {
    expect(walletHistoryStatus({ ...row, resolutionKind: "self_deposit_returned" })).toBe("연결 결과: 집중 디파짓 반환");
  });
  it("shows a verified settlement even if the legacy request was failed", () => {
    expect(walletHistoryStatus({ ...row, status: "failed", resolutionKind: "topup_confirmed" })).toBe("연결 결과: 충전 완료");
  });
  it("does not claim balance movement for reward request events", () => {
    expect(walletHistoryMovement({ ...row, fromBucket: "external", toBucket: null })).toContain("잔액 이동은 없습니다");
    expect(walletHistoryMovement({ ...row, status: "pending" })).toContain("반영되지 않은");
  });
  it("maps safe failure codes and distinguishes missing detail", () => {
    expect(walletHistoryReason({ ...row, reasonCode: "student-withdrawn" })).toContain("학생이");
    expect(walletHistoryReason({ ...row, kind: "cashout_rejected" })).toContain("제공되지 않았습니다");
  });
  it.each([
    { ...page, ownerUserId: id }, { ...page, items: [{ ...row, metadata: { secret: "provider secret" } }] },
    { ...page, items: [{ ...row, points: -1 }] }, { ...page, items: [{ ...row, reasonCode: "secret error" }] },
    { ...page, items: [row, row] }, { ...page, hasMore: true }, { ...page, items: [{ ...row, fromBucket: null, toBucket: null }] },
    { ...page, hasMore: true, nextCursor: { id: owner, createdAt: row.createdAt } },
  ])("rejects malformed, unsafe, foreign, or inconsistent pages", (value) => {
    expect(parseWalletHistory(value, owner)).toBeNull();
  });
  it("retains PostgreSQL microsecond precision across pages", async () => {
    const next = { ...row, id: "ffffffff-ffff-4fff-8fff-ffffffffffff", createdAt: "2026-10-02T01:00:00.123455+00:00" };
    expect(walletRowBefore(next, row)).toBe(true);
    expect(await loadWalletHistory({ rpc: async () => ({ data: { ...page, items: [next] }, error: null }) }, owner, "all", { id, createdAt: row.createdAt })).toMatchObject({ items: [next] });
  });
  it("uses IDs to break equal timestamp ties", () => {
    expect(walletRowBefore({ ...row, id: owner }, row)).toBe(true);
    expect(walletRowBefore(row, row)).toBe(false);
  });
  it("rejects reordered pages", () => {
    expect(parseWalletHistory({ ...page, items: [{ ...row, id: owner }, row] }, owner)).toBeNull();
  });
  it("does not accept cursor boundary repeats or another target transaction", async () => {
    const rpc = async () => ({ data: page, error: null });
    await expect(loadWalletHistory({ rpc }, owner, "all", { createdAt: row.createdAt, id })).rejects.toThrow("거래 내역을 확인하지 못했습니다");
    await expect(loadWalletHistory({ rpc }, owner, "all", null, owner)).rejects.toThrow("거래 내역을 확인하지 못했습니다");
  });
  it("accepts an empty owned page and sends no arbitrary owner selector", async () => {
    const rpc = vi.fn(async () => ({ data: { ...page, items: [] }, error: null }));
    await expect(loadWalletHistory({ rpc }, owner, "reward")).resolves.toMatchObject({ items: [] });
    expect(rpc.mock.calls[0]).toEqual(["list_wallet_transactions", { p_category: "reward", p_limit: 20, p_before_at: null, p_before_id: null, p_transaction_id: null }]);
  });
  it("does not expose thrown provider errors or data returned with an error", async () => {
    await expect(loadWalletHistory({ rpc: async () => { throw new Error("secret"); } }, owner, "all")).rejects.not.toThrow("secret");
    await expect(loadWalletHistory({ rpc: async () => ({ data: page, error: new Error("secret") }) }, owner, "all")).rejects.toThrow("거래 내역을 확인하지 못했습니다");
  });
});
