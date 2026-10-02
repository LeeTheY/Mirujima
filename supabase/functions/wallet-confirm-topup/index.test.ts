import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), authenticated: vi.fn(), handler: null as ((request: Request) => Promise<Response>) | null }));
vi.mock("../_shared/membership.ts", () => ({ authenticatedClient: mocks.authenticated, corsHeaders: {}, json: (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }) }));
const userId = "11111111-1111-4111-8111-111111111111";
const input = { paymentKey: "fixture_payment", orderId: "fixture_order", amount: 10000 };
const done = { ...input, totalAmount: 10000, status: "DONE", currency: "KRW" };
const request = () => new Request("https://fixture.invalid", { method: "POST", body: JSON.stringify(input) });
beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (handler: typeof mocks.handler) => { mocks.handler=handler; }, env: { get: (name: string) => name === "TOSS_PAYMENT_MODE" ? "test" : "test_sk_fixture" } });
  await import("./index");
});
beforeEach(() => { mocks.rpc.mockReset(); mocks.authenticated.mockReset(); mocks.authenticated.mockResolvedValue({ user: { id: userId }, admin: { rpc: mocks.rpc } }); });
describe("actual topup approval handler", () => {
  it("reconciles using the authenticated owner's stored amount and key", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { provider_order_id: input.orderId, provider_payment_key: input.paymentKey, krw_amount: input.amount }, error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    mocks.authenticated.mockResolvedValue({ user: { id: userId }, admin: { rpc: mocks.rpc, from: vi.fn().mockReturnValue(query) } });
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_topup_payment" ? { status: "confirming", reconciliationRequired: true } : { status: "confirmed", points: input.amount }, error: null }));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(done))); vi.stubGlobal("fetch", fetcher);
    const result = await mocks.handler!(new Request("https://fixture.invalid", { method: "POST", body: JSON.stringify({ action: "reconcile", orderId: input.orderId, amount: 99999, paymentKey: "untrusted" }) }));
    expect(await result.json()).toMatchObject({ status: "confirmed", points: input.amount });
    expect(query.eq).toHaveBeenCalledWith("to_user_id", userId);
    expect(mocks.rpc).toHaveBeenCalledWith("claim_topup_payment", { p_user_id: userId, p_order_id: input.orderId, p_payment_key: input.paymentKey, p_callback_amount: input.amount });
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET"]);
  });
  it("does not call the provider for an order outside the owner's query", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    mocks.authenticated.mockResolvedValue({ user: { id: userId }, admin: { rpc: mocks.rpc, from: vi.fn().mockReturnValue(query) } });
    const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetcher);
    const result = await mocks.handler!(new Request("https://fixture.invalid", { method: "POST", body: JSON.stringify({ action: "reconcile", orderId: input.orderId }) }));
    expect(result.status).toBe(400); expect(query.eq).toHaveBeenCalledWith("to_user_id", userId);
    expect(fetcher).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("recovers provider success followed by DB failure without approving twice", async () => {
    let claimCount=0, writes=0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_topup_payment") return { data: { status: writes ? "confirmed" : "confirming", points: 10000, reconciliationRequired: claimCount++ > 0 }, error: null };
      if (name === "confirm_toss_topup_payment") { if (claimCount === 1) return { data: null, error: new Error("DB response lost") }; writes++;return { data: { status: "confirmed", points: 10000 }, error: null }; }
      return { data: { topupAvailable: 10000 }, error: null };
    });
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(done)));vi.stubGlobal("fetch",fetcher);
    expect((await mocks.handler!(request())).status).toBe(400);
    expect(await (await mocks.handler!(request())).json()).toMatchObject({ status: "confirmed", points: 10000 });
    expect(await (await mocks.handler!(request())).json()).toMatchObject({ status: "confirmed", points: 10000 });
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["POST","GET"]);
    expect(writes).toBe(1);expect(mocks.rpc.mock.calls.filter((call) => call[0] === "fail_topup_payment")).toHaveLength(0);
  });
  it("keeps an uncertain API failure recoverable", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "confirming", points: 10000, reconciliationRequired: false }, error: null });
    vi.stubGlobal("fetch",vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({code:"ALREADY_PROCESSING_REQUEST"}),{status:400})));
    const result=await mocks.handler!(request());expect(result.status).toBe(502);expect(await result.json()).toEqual({error:"payment_temporarily_unavailable"});
    expect(mocks.rpc.mock.calls.filter((call) => call[0] === "fail_topup_payment")).toHaveLength(0);
  });
  it("fails only an observed terminal payment", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "confirming", points: 10000, reconciliationRequired: false }, error: null });
    vi.stubGlobal("fetch",vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({code:"REJECT_CARD_COMPANY"}),{status:400})).mockResolvedValueOnce(new Response(JSON.stringify({...done,status:"ABORTED"}))));
    expect((await mocks.handler!(request())).status).toBe(400);
    expect(mocks.rpc.mock.calls.filter((call) => call[0] === "fail_topup_payment")).toHaveLength(1);
  });
});
