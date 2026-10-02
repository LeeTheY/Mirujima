import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), rpc: vi.fn(), single: vi.fn(), handler: null as ((request: Request) => Promise<Response>) | null }));
vi.mock("../_shared/membership.ts", () => ({ authenticatedClient: mocks.authenticated, corsHeaders: {}, json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }) }));
const balances = { topupAvailable: 7000, earnedAvailable: 1000, reservedAvailable: 3000, cashoutReserved: 0, cashoutCompleted: 0, guardianRewardCompleted: 0 };
beforeAll(async () => { vi.stubGlobal("Deno", { serve: (handler: typeof mocks.handler) => { mocks.handler = handler; } }); await import("./index"); });
beforeEach(() => {
  mocks.rpc.mockReset(); mocks.single.mockReset(); mocks.authenticated.mockReset();
  const query = { select: vi.fn(), eq: vi.fn(), single: mocks.single }; query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  mocks.authenticated.mockResolvedValue({ user: { id: "owner" }, admin: { rpc: mocks.rpc }, client: { from: vi.fn().mockReturnValue(query) } });
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "get_wallet_balances" ? balances : { maxRefundableTopup: 4000 }, error: null }));
});
describe("role-aware wallet projection", () => {
  it("returns canonical student balances without the guardian-only refund RPC", async () => {
    mocks.single.mockResolvedValue({ data: { role: "student" }, error: null });
    const response = await mocks.handler!(new Request("https://example.com", { method: "POST" }));
    expect(await response.json()).toEqual({ ...balances, maxRefundableTopup: 0 });
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["get_wallet_balances"]);
  });
  it("keeps guardian refund limits from the server", async () => {
    mocks.single.mockResolvedValue({ data: { role: "guardian" }, error: null });
    const response = await mocks.handler!(new Request("https://example.com", { method: "POST" }));
    expect(await response.json()).toEqual({ ...balances, maxRefundableTopup: 4000 });
  });
  it("does not manufacture balances when role lookup fails", async () => {
    mocks.single.mockResolvedValue({ data: null, error: new Error("private database error") });
    const response = await mocks.handler!(new Request("https://example.com", { method: "POST" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "wallet_summary_failed" });
  });
});
