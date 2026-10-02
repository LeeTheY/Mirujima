import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), rpc: vi.fn(), handler: null as ((request: Request) => Promise<Response>) | null }));
vi.mock("../_shared/membership.ts", () => ({ authenticatedClient: mocks.authenticated, corsHeaders: {}, json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }) }));
beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (handler: typeof mocks.handler) => { mocks.handler = handler; } });
  await import("./index");
});
beforeEach(() => { mocks.authenticated.mockReset(); mocks.rpc.mockReset(); });
describe("cashout launch boundary", () => {
  it("never reserves points or manufactures a payout even for authenticated users", async () => {
    mocks.authenticated.mockResolvedValue({ user: { id: "student" }, admin: { rpc: mocks.rpc } });
    const response = await mocks.handler!(new Request("https://example.com", { method: "POST", body: JSON.stringify({ points: 3000, idempotencyKey: "cashout-fixture" }) }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "cashout_unavailable" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("authenticates before exposing request status", async () => {
    mocks.authenticated.mockRejectedValue(new Error("private auth error"));
    const response = await mocks.handler!(new Request("https://example.com", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "authentication_required" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
