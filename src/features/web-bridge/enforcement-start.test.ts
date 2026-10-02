import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), applyRules: vi.fn(), setEndAlarm: vi.fn(), order: [] as string[] }));
vi.mock("../../shared/storage/repository", () => ({ repository: {
  initialize: vi.fn(), getCanonicalRuntimeUserId: vi.fn(), setCanonicalRuntimeUserId: vi.fn(),
  getActiveSession: vi.fn().mockResolvedValue(null), getSchedules: vi.fn().mockResolvedValue([]),
  setSchedules: vi.fn(), setActiveSession: vi.fn(), setExternalRequestReceipts: vi.fn(), getTemporaryAllows: vi.fn().mockResolvedValue([]),
} }));
vi.mock("../cloud-sync/storage", () => ({ runWithoutCloudQueue: async (action: () => Promise<unknown>) => action() }));
vi.mock("../membership/storage", () => ({ getOrCreateDeviceId: vi.fn().mockResolvedValue("extension-device") }));
vi.mock("../../background/blocking", () => ({ applyBlockingRules: mocks.applyRules, clearBlockingRules: vi.fn() }));
vi.mock("../../background/alarms", () => ({ clearBreakEndAlarm: vi.fn(), clearFocusEndAlarm: vi.fn(), ensureFocusCheckAlarm: vi.fn(), setFocusEndAlarm: mocks.setEndAlarm }));
vi.mock("../../background/reports", () => ({ generateReport: vi.fn() }));
vi.mock("../../background/notifications", () => ({ showNotification: vi.fn() }));
vi.mock("../membership/service", () => ({ membershipSupabaseClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
  rpc: mocks.rpc,
  from: () => ({ select: () => ({ eq: () => ({ is: () => ({ single: async () => ({ data: { payload: plan }, error: null }) }) }) }) }),
}) }));
import { clearCanonicalRuntimeForSignOut, reconcileCanonicalFocus } from "./canonical-focus";

const owner = "f3111111-1111-4111-8111-111111111111";
const plan = {
  id: "plan", ownerUserId: owner, title: "집중", description: "", dateKey: "2026-10-02", plannedStartAt: null,
  targetFocusMinutes: 5, activityMode: "interactive", blockingMode: "blocklist", allowedDomains: [],
  blockedDomains: [{ hostname: "youtube.com", includeSubdomains: true }], breakMinutes: 5, priority: "medium",
  selfDepositPoints: 0, guardianRewardRequestPoints: 0, goals: [{ id: "goal", name: "목표", detail: "", minutes: 5, priority: "medium" }],
  status: "ready", createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
};
const pending = {
  id: "session", scheduleId: "plan", ownerUserId: owner, startedAt: "2026-10-02T00:00:00Z",
  endsAt: "2026-10-02T00:05:00Z", targetFocusMinutes: 5, blockingMode: "blocklist", goals: plan.goals, status: "starting",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.length = 0;
  vi.stubGlobal("chrome", { action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() } });
  mocks.applyRules.mockImplementation(async () => { mocks.order.push("apply"); });
  mocks.setEndAlarm.mockImplementation(async () => { mocks.order.push("alarm"); });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "confirm_focus_enforcement") { mocks.order.push("confirm"); return { data: { ...pending, status: "active" }, error: null }; }
    return { data: pending, error: null };
  });
});
afterEach(() => { vi.unstubAllGlobals(); });
describe("extension enforcement start protocol", () => {
  it("confirms only after DNR succeeded and starts the timer after confirmation", async () => {
    await expect(reconcileCanonicalFocus("plan", "session")).resolves.toMatchObject({ status: "active" });
    expect(mocks.order).toEqual(["apply", "confirm", "apply", "alarm"]);
    expect(mocks.rpc).toHaveBeenCalledWith("confirm_focus_enforcement", { p_session_id: "session", p_device_id: "extension-device" });
  });
  it("never acknowledges when DNR application fails", async () => {
    mocks.applyRules.mockRejectedValueOnce(new Error("DNR unavailable"));
    await expect(reconcileCanonicalFocus("plan", "session")).rejects.toThrow("DNR unavailable");
    expect(mocks.rpc.mock.calls.some(([name]) => name === "confirm_focus_enforcement")).toBe(false);
    expect(mocks.setEndAlarm).not.toHaveBeenCalled();
  });
  it("uses the same confirmation path when periodic resync finds the pending start", async () => {
    await expect(reconcileCanonicalFocus()).resolves.toMatchObject({ status: "active" });
    expect(mocks.rpc).toHaveBeenCalledWith("get_current_focus_session", undefined);
    expect(mocks.order.indexOf("confirm")).toBeGreaterThan(mocks.order.indexOf("apply"));
  });
});


it("rejects an acknowledgement for a different canonical session", async () => {
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "confirm_focus_enforcement" ? { ...pending, id: "other", status: "active" } : pending, error: null }));
  await expect(reconcileCanonicalFocus("plan", "session")).rejects.toThrow("서버 시작 상태");
  expect(mocks.setEndAlarm).not.toHaveBeenCalled();
});


it("waits for an in-flight reconcile before signing out, preventing later DNR reapplication", async () => {
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  mocks.rpc.mockImplementation(async () => { entered(); await waiting; return { data: { ...pending, status: "active" }, error: null }; });
  const reconciling = reconcileCanonicalFocus("plan", "session");
  await ready;
  const signingOut = clearCanonicalRuntimeForSignOut(async () => { mocks.order.push("sign-out"); });
  expect(mocks.order).not.toContain("sign-out");
  release();
  await reconciling;
  await signingOut;
  expect(mocks.order).toEqual(["apply", "alarm", "sign-out"]);
});
