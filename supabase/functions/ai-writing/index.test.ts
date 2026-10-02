import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ handler: null as ((r: Request) => Promise<Response>) | null, rpc: vi.fn(), member: vi.fn(), entitlement: vi.fn(), role: vi.fn() }));
vi.mock("../_shared/membership.ts", () => ({
  authenticatedClient: async () => ({ client: { rpc: mocks.rpc }, user: { id: "11111111-1111-4111-8111-111111111111" } }),
  assertActiveMembership: mocks.member, assertEntitlement: mocks.entitlement, assertProfileRole: mocks.role,
  registerDevice: async () => {}, corsHeaders: {}, json: (body: unknown, status = 200) => Response.json(body, { status }),
}));
const data = [{ displayName: "학생", completionRate: null, totalFocusMinutes: 40, rewardStatus: "공유 안 함", aiSummary: null }];
const result = { title: "가족 요약", summary: "공유 시간 기준", suggestions: ["함께 계획하기"] };
const request = () => new Request("https://fixture.invalid", { method: "POST", body: JSON.stringify({ action: "guardian-summary" }) });
beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (handler: typeof mocks.handler) => { mocks.handler = handler; }, env: { get: (key: string) => key === "AI_TIMEOUT_MS" ? "1000" : "test-fixture" } }); await import("./index");
});
beforeEach(() => {
  vi.resetAllMocks(); mocks.member.mockResolvedValue(undefined); mocks.entitlement.mockResolvedValue(undefined); mocks.role.mockResolvedValue("guardian");
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "consume_ai_task_rate_limit" ? true : data, error: null }));
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ choices: [{ message: { content: JSON.stringify(result) } }] })));
});
afterEach(() => vi.useRealTimers());
describe("actual AI consent handler", () => {
  it("returns a revision only after a second consent check", async () => {
    const response = await mocks.handler!(request()); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ...result, consentRevision: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(mocks.rpc.mock.calls.filter((args) => args[0] === "get_guardian_ai_summary_input")).toHaveLength(2);
    expect(JSON.stringify(vi.mocked(fetch).mock.calls)).not.toContain("private-url");
  });
  it("never calls the provider with no opted-in student", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "consume_ai_task_rate_limit" ? true : [], error: null }));
    expect((await mocks.handler!(request())).status).toBe(400); expect(fetch).not.toHaveBeenCalled();
  });
  it("discards a provider result if consent changes in flight", async () => {
    let checks = 0; mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "consume_ai_task_rate_limit" ? true : checks++ === 0 ? data : [], error: null }));
    const response = await mocks.handler!(request()); expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: "guardian_consent_changed" });
  });
  it("discards the result if membership expires during generation", async () => {
    mocks.member.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("active membership required"));
    expect((await mocks.handler!(request())).status).toBe(403);
  });
  it("does not expose provider details and separates role denial", async () => {
    mocks.role.mockRejectedValue(new Error("AI role required private-detail"));
    expect(await (await mocks.handler!(request())).json()).toEqual({ error: "ai_role_required" }); expect(fetch).not.toHaveBeenCalled();
  });
  it("enforces one total provider deadline without retrying an aborted call", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => { init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))); })));
    const response = mocks.handler!(request()); await vi.advanceTimersByTimeAsync(1001);
    expect((await response).status).toBe(504); expect(fetch).toHaveBeenCalledTimes(1);
  });
});
