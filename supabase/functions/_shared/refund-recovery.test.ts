import { describe, expect, it, vi } from "vitest";
import { recoverableTossRefund, refundMode, refundReason } from "./refund-recovery";
import { cancelTossPayment } from "./toss";
const id = "11111111-1111-4111-8111-111111111111";
const input = { refundRequestId: id, paymentKey: "payment_fixture", orderId: "order_fixture", originalAmount: 10000, points: 3000, dispatched: false };
const config = { secretKey: "test_sk_fixture" };
const snapshot = { balanceAmount: 10000, transactionKeys: [] };
const before = { paymentKey: input.paymentKey, orderId: input.orderId, totalAmount: 10000, balanceAmount: 10000, currency: "KRW", status: "DONE", method: "카드", isPartialCancelable: true, cancels: null };
const cancel = { cancelReason: refundReason(id), cancelAmount: 3000, cancelStatus: "DONE", transactionKey: "cancel_fixture" };
const after = { ...before, status: "PARTIALLY_CANCELED", balanceAmount: 7000, cancels: [cancel] };
function response(data: unknown) { return new Response(JSON.stringify(data)); }
function prepare() { return vi.fn().mockResolvedValue({ canDispatch: true, providerSnapshot: snapshot }); }
describe("provider refund recovery", () => {
  it("binds a live-key receipt to provider_live without changing recovery behavior", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(before)).mockResolvedValueOnce(response(after));
    expect(await recoverableTossRefund({ secretKey: "live_sk_fixture" }, input, prepare(), fetcher)).toMatchObject({ providerMode: "provider_live", actualRefund: true });
    expect(refundMode("provider_live")).toBe("provider_live");
  });
  it("preserves the existing full-cancel requirement for callers without an amount", async () => {
    await expect(cancelTossPayment(config, { paymentKey: input.paymentKey, idempotencyKey: "full-cancel-fixture", cancelReason: "fixture" }, vi.fn().mockResolvedValue(response(after)))).rejects.toMatchObject({ code: "TOSS_RESPONSE_MISMATCH" });
  });
  it("requires an explicit isolated mode", () => { expect(refundMode("sandbox")).toBe("sandbox"); expect(refundMode("provider_test")).toBe("provider_test"); for (const mode of [undefined, "test", "live"]) expect(() => refundMode(mode)).toThrow(); });
  it("queries, records dispatch, then cancels exactly the requested amount", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(before)).mockResolvedValueOnce(response(after)); const lock = prepare();
    expect(await recoverableTossRefund(config, input, lock, fetcher)).toMatchObject({ cancelAmount: 3000, transactionKey: "cancel_fixture", actualRefund: true, sandbox: false });
    expect(lock).toHaveBeenCalledWith(snapshot);
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET", "POST"]);
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ cancelAmount: 3000, cancelReason: refundReason(id) });
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({ "Idempotency-Key": `topup-refund-cancel:${id}` });
  });
  it("recovers lost cancellation response with a lookup", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(before)).mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(response(after));
    expect(await recoverableTossRefund(config, input, prepare(), fetcher)).toMatchObject({ cancelAmount: 3000 }); expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET", "POST", "GET"]);
  });
  it("retries dispatched requests with GET only, including DB failures", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(after)); const lock = prepare();
    await recoverableTossRefund(config, { ...input, dispatched: true, providerSnapshot: snapshot }, lock, fetcher);
    expect(lock).not.toHaveBeenCalled(); expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET"]);
  });
  it("a concurrent dispatch loser only queries", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(before)).mockResolvedValueOnce(response(after));
    await recoverableTossRefund(config, input, vi.fn().mockResolvedValue({ canDispatch: false, providerSnapshot: snapshot }), fetcher);
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET", "GET"]);
  });
  it.each([
    { paymentKey: "foreign" }, { orderId: "foreign" }, { totalAmount: 20000 }, { currency: "USD" }, { balanceAmount: -1 }, { balanceAmount: 2.2 }, { method: "가상계좌" }, { isPartialCancelable: false }, { balanceAmount: 2000 }, { status: "WAITING_FOR_DEPOSIT" },
  ])("does not cancel an invalid original payment %j", async (changes) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ ...before, ...changes })); const lock = prepare();
    await expect(recoverableTossRefund(config, input, lock, fetcher)).rejects.toThrow(); expect(lock).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    { cancels: [{ ...cancel, cancelReason: "unrelated" }] }, { cancels: [{ ...cancel, cancelAmount: 2000 }] }, { cancels: [{ ...cancel, cancelStatus: "PENDING" }] }, { cancels: [cancel, cancel] }, { cancels: [] }, { balanceAmount: 6000 },
  ])("keeps an unmatched or incomplete cancellation unresolved %j", async (changes) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ ...after, ...changes }));
    await expect(recoverableTossRefund(config, { ...input, dispatched: true, providerSnapshot: snapshot }, prepare(), fetcher)).rejects.toMatchObject({ retryable: true }); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("cannot reuse a cancellation present before dispatch", async () => {
    await expect(recoverableTossRefund(config, { ...input, dispatched: true, providerSnapshot: { ...snapshot, transactionKeys: [cancel.transactionKey] } }, prepare(), vi.fn().mockResolvedValue(response(after)))).rejects.toThrow();
  });
  it("does not retry POST after an ambiguous cancel error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(before)).mockResolvedValueOnce(new Response(JSON.stringify({ code: "ALREADY_PROCESSING_REQUEST" }), { status: 400 })).mockResolvedValueOnce(response(before));
    await expect(recoverableTossRefund(config, input, prepare(), fetcher)).rejects.toMatchObject({ code: "TOSS_REFUND_UNCERTAIN" }); expect(fetcher.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
  });
});
