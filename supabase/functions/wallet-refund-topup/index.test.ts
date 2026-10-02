import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), authenticated: vi.fn(), handler: null as ((request: Request) => Promise<Response>) | null, mode: "provider_test" as string | undefined }));
vi.mock("../_shared/membership.ts", () => ({ authenticatedClient: mocks.authenticated, corsHeaders: {}, json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }) }));
const user = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
const request = () => new Request("https://fixture.invalid", { method: "POST", body: JSON.stringify({ idempotencyKey: "refund-handler-fixture", points: 3000 }) });
const before = { paymentKey: "payment_fixture", orderId: "order_fixture", totalAmount: 10000, balanceAmount: 10000, currency: "KRW", status: "DONE", method: "카드", isPartialCancelable: true, cancels: null };
const after = { ...before, status: "PARTIALLY_CANCELED", balanceAmount: 7000, cancels: [{ cancelReason: `Mirujima refund ${id}`, cancelAmount: 3000, cancelStatus: "DONE", transactionKey: "cancel_handler_fixture" }] };
const snapshot = { balanceAmount: 10000, transactionKeys: [] };
beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (handler: typeof mocks.handler) => { mocks.handler = handler; }, env: { get: (key: string) => key === "TOSS_PAYMENT_MODE" ? "test" : key === "MIRUJIMA_REFUND_MODE" ? mocks.mode : "test_sk_fixture" } });
  await import("./index");
});
beforeEach(() => { mocks.rpc.mockReset(); mocks.authenticated.mockReset(); mocks.mode = "provider_test"; mocks.authenticated.mockResolvedValue({ admin: { rpc: mocks.rpc }, user: { id: user } }); });
function claim(dispatched = false) { return { status: "reserved", points: 3000, refundRequestId: id, paymentKey: before.paymentKey, originalOrderId: before.orderId, originalAmount: 10000, dispatched, providerSnapshot: dispatched ? snapshot : null }; }
describe("actual refund handler", () => {
  it("returns an undispatched reservation when provider preflight forbids partial cancellation", async () => {
    const balances = { topupAvailable: 10000, earnedAvailable: 0, reservedAvailable: 0, cashoutReserved: 0, cashoutCompleted: 0, guardianRewardCompleted: 0 };
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "reserve_latest_topup_refund" ? claim() : name === "reject_topup_refund" ? { status: "rejected", refundRequestId: id, points: 3000, balances } : { maxRefundableTopup: 10000 }, error: null }));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...before, isPartialCancelable: false }))); vi.stubGlobal("fetch", fetcher);
    const response = await mocks.handler!(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "rejected", refundRequestId: id, points: 3000, balances, maxRefundableTopup: 10000 });
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual(["reserve_latest_topup_refund", "reject_topup_refund", "get_topup_refund_limits"]);
    expect(mocks.rpc).toHaveBeenCalledWith("reject_topup_refund", { p_user_id: user, p_refund_request_id: id });
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET"]);
  });
  it("keeps funds reserved if a concurrent dispatch prevents preflight rejection", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "reserve_latest_topup_refund" ? { data: claim(), error: null } : { data: null, error: new Error("dispatched refund requires reconciliation") });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...before, isPartialCancelable: false }))); vi.stubGlobal("fetch", fetcher);
    const response = await mocks.handler!(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "refund_result_unconfirmed" });
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual(["reserve_latest_topup_refund", "reject_topup_refund"]);
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET"]);
  });
  it("uses the canonical receipt when concurrent completion wins over preflight rejection", async () => {
    let claimed = false;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "reserve_latest_topup_refund") {
        const data = claimed ? { status: "refunded", refundRequestId: id, points: 3000, sandbox: false, actualRefund: true, balances: { topupAvailable: 7000 } } : claim();
        claimed = true; return { data, error: null };
      }
      return { data: name === "reject_topup_refund" ? { status: "refunded", points: 3000 } : { maxRefundableTopup: 7000 }, error: null };
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...before, isPartialCancelable: false }))); vi.stubGlobal("fetch", fetcher);
    const response = await mocks.handler!(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "refunded", refundRequestId: id, points: 3000, sandbox: false, actualRefund: true, maxRefundableTopup: 7000 });
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual(["reserve_latest_topup_refund", "reject_topup_refund", "reserve_latest_topup_refund", "get_topup_refund_limits"]);
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET"]);
  });
  it("recovers provider success then DB failure with GET only and no rejection", async () => {
    let dispatched = false, posted = false;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "reserve_latest_topup_refund") return { data: posted ? { status: "refunded", points: 3000, sandbox: false, actualRefund: true } : claim(dispatched), error: null };
      if (name === "prepare_topup_refund") { dispatched = true; return { data: { canDispatch: true, providerSnapshot: snapshot }, error: null }; }
      if (name === "complete_topup_refund") { if (!posted) { posted = true; return { data: null, error: new Error("DB response lost") }; } return { data: { status: "refunded", points: 3000 }, error: null }; }
      return { data: { maxRefundableTopup: 7000 }, error: null };
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify(before))).mockResolvedValueOnce(new Response(JSON.stringify(after))); vi.stubGlobal("fetch", fetcher);
    expect((await mocks.handler!(request())).status).toBe(502);
    expect(await (await mocks.handler!(request())).json()).toMatchObject({ status: "refunded", actualRefund: true });
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET", "POST"]);
    expect(mocks.rpc.mock.calls.filter((call) => call[0] === "reject_topup_refund")).toHaveLength(0);
    expect(mocks.rpc.mock.calls[0]).toEqual(["reserve_latest_topup_refund", { p_user_id: user, p_idempotency_key: "refund-handler-fixture", p_points: 3000 }]);
  });
  it("reconciles a dispatched cancellation after a failed DB write", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "reserve_latest_topup_refund" ? claim(true) : name === "complete_topup_refund" ? { status: "refunded", points: 3000, sandbox: false, actualRefund: true } : { maxRefundableTopup: 7000 }, error: null }));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(after))); vi.stubGlobal("fetch", fetcher);
    expect((await mocks.handler!(request())).status).toBe(200);
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET"]);
    expect(mocks.rpc.mock.calls.filter((call) => ["prepare_topup_refund", "reject_topup_refund"].includes(call[0]))).toHaveLength(0);
  });
  it("does not release the reservation when the provider outcome is unknown", async () => {
    mocks.rpc.mockResolvedValue({ data: claim(true), error: null }); vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect((await mocks.handler!(request())).status).toBe(502);
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual(["reserve_latest_topup_refund"]);
  });
  it("sandbox never calls Toss and binds the explicit mode", async () => {
    mocks.mode = "sandbox";
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "reserve_latest_topup_refund" ? claim() : name === "complete_topup_refund" ? { status: "refunded", points: 3000, sandbox: true, actualRefund: false } : { maxRefundableTopup: 7000 }, error: null }));
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await (await mocks.handler!(request())).json()).toMatchObject({ sandbox: true, actualRefund: false }); expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("prepare_topup_refund", { p_user_id: user, p_refund_request_id: id, p_mode: "sandbox", p_provider_snapshot: null });
  });
  it("missing mode fails closed before reserving", async () => {
    mocks.mode = undefined; vi.stubGlobal("fetch", vi.fn()); expect((await mocks.handler!(request())).status).toBe(503); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("projection failure after completion does not turn the refund into a rejection", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "reserve_latest_topup_refund" ? { data: { status: "refunded", points: 3000, sandbox: true, actualRefund: false }, error: null } : { data: null, error: new Error("read failed") });
    expect(await (await mocks.handler!(request())).json()).toMatchObject({ status: "refunded", maxRefundableTopup: null });
    expect(mocks.rpc.mock.calls.filter((call) => call[0] === "reject_topup_refund")).toHaveLength(0);
  });
});
