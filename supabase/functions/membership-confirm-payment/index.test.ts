import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), authenticated: vi.fn(), membership: vi.fn(), query: { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }, handler: null as ((request: Request) => Promise<Response>) | null }));
vi.mock("../_shared/membership.ts", () => ({ authenticatedClient: mocks.authenticated, membershipResponse: mocks.membership, corsHeaders: {}, json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }) }));
const owner = "11111111-1111-4111-8111-111111111111";
const input = { paymentKey: "membership_payment", orderId: "membership_order", amount: 9900 };
const done = { ...input, totalAmount: 9900, status: "DONE", currency: "KRW" };
const request = (body: unknown = input) => new Request("https://fixture.invalid", { method: "POST", body: JSON.stringify(body) });
beforeAll(async () => { vi.stubGlobal("Deno", { serve: (handler: typeof mocks.handler) => { mocks.handler = handler; }, env: { get: (key: string) => key === "TOSS_PAYMENT_MODE" ? "test" : "test_sk_fixture" } }); await import("./index"); });
beforeEach(() => {
  mocks.rpc.mockReset(); mocks.authenticated.mockReset(); mocks.membership.mockReset(); mocks.query.select.mockReset(); mocks.query.eq.mockReset(); mocks.query.maybeSingle.mockReset();
  mocks.query.select.mockReturnValue(mocks.query); mocks.query.eq.mockReturnValue(mocks.query); mocks.query.maybeSingle.mockResolvedValue({ data: { order_kind: "membership", order_id: input.orderId, payment_key: input.paymentKey, amount_krw: input.amount }, error: null });
  mocks.authenticated.mockResolvedValue({ user: { id: owner }, client: {}, admin: { rpc: mocks.rpc, from: vi.fn().mockReturnValue(mocks.query) } });
  mocks.membership.mockResolvedValue({ status: "active", productCode: "student_premium", currentPeriodEndsAt: "2099-01-01T00:00:00Z" });
});
describe("actual membership confirmation handler", () => {
  it.each(["membership", "family_seat"])("recovers a legacy failed %s order with verified DONE and GET only", async (orderKind) => {
    mocks.query.maybeSingle.mockResolvedValue({ data: { order_kind: orderKind, order_id: input.orderId, payment_key: input.paymentKey, amount_krw: input.amount }, error: null });
    mocks.rpc.mockResolvedValue({ data: { status: "confirming", reconciliationRequired: true, reconciliationOnly: true }, error: null });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(done))); vi.stubGlobal("fetch", fetcher);
    expect((await mocks.handler!(request({ action: "reconcile", orderId: input.orderId }))).status).toBe(200);
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET"]);
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual(["claim_membership_payment", orderKind === "family_seat" ? "confirm_toss_family_seat_payment" : "confirm_toss_membership_payment"]);
  });
  it("does not reapprove an IN_PROGRESS provider payment for a legacy failed order", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "confirming", reconciliationRequired: true, reconciliationOnly: true }, error: null });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...done, status: "IN_PROGRESS" }))); vi.stubGlobal("fetch", fetcher);
    expect((await mocks.handler!(request({ action: "reconcile", orderId: input.orderId }))).status).toBe(502);
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET"]);
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual(["claim_membership_payment"]);
  });
  it("recovers DB failure without repeating provider approval", async () => {
    let claims = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_membership_payment") return { data: { status: "confirming", reconciliationRequired: claims++ > 0 }, error: null };
      return claims === 1 ? { data: null, error: new Error("DB write failed") } : { data: {}, error: null };
    });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(done))); vi.stubGlobal("fetch", fetcher);
    expect((await mocks.handler!(request())).status).toBe(400);
    expect(await (await mocks.handler!(request())).json()).toMatchObject({ paymentOrder: { status: "confirmed", orderId: input.orderId, amount: 9900, orderKind: "membership" } });
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["POST", "GET"]);
    expect(mocks.rpc.mock.calls.filter((call) => call[0] === "fail_membership_payment")).toHaveLength(0);
  });
  it("reconciles only the owner's canonical payment, ignoring client amount and key", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "confirming", reconciliationRequired: true }, error: null });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(done))); vi.stubGlobal("fetch", fetcher);
    expect((await mocks.handler!(request({ action: "reconcile", orderId: input.orderId, amount: 12900, paymentKey: "foreign" }))).status).toBe(200);
    expect(mocks.query.eq).toHaveBeenCalledWith("user_id", owner);
    expect(mocks.rpc).toHaveBeenCalledWith("claim_membership_payment", { p_user_id: owner, p_order_id: input.orderId, p_payment_key: input.paymentKey, p_callback_amount: 9900 });
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET"]);
  });
  it("does not query Toss or claim orders absent from the owner's lookup", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null }); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await mocks.handler!(request({ action: "reconcile", orderId: input.orderId }))).status).toBe(400); expect(fetcher).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("separates historical approval from an expired membership", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "confirmed" }, error: null }); mocks.membership.mockResolvedValue({ status: "inactive", plan: "free" }); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await (await mocks.handler!(request())).json()).toMatchObject({ status: "inactive", paymentOrder: { status: "confirmed", orderId: input.orderId } }); expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the family-seat activation boundary without extending the base period", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: { order_kind: "family_seat" }, error: null }); mocks.rpc.mockResolvedValue({ data: { status: "confirming", reconciliationRequired: true }, error: null }); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(done))));
    expect((await mocks.handler!(request())).status).toBe(200);
    expect(mocks.rpc.mock.calls.filter((call) => call[0] === "confirm_toss_family_seat_payment")).toHaveLength(1);
    expect(mocks.rpc.mock.calls.filter((call) => call[0] === "confirm_toss_membership_payment")).toHaveLength(0);
  });
});
