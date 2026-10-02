import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusSession, Schedule, UserSettings } from "../../shared/types/models";
import type { CloudRecord, PendingCloudMutation } from "./types";

const mocks = vi.hoisted(() => ({ schedules: [] as Schedule[], sessions: [] as FocusSession[], invoke: vi.fn(), stored: {} as Record<string, unknown> }));
vi.mock("../membership/storage", () => ({
  getMembershipCache: async () => ({ plan: "premium", status: "active", currentPeriodEndsAt: "2099-01-01T00:00:00Z", entitlements: ["cloud-sync"] }),
  getOrCreateDeviceId: async () => "extension-device",
}));
vi.mock("../membership/service", () => ({ membershipDevicePayload: async () => ({}), membershipSupabaseClient: () => ({ functions: { invoke: mocks.invoke } }) }));
vi.mock("../../shared/storage/repository", () => ({ repository: {
  getSchedules: async () => mocks.schedules,
  setSchedules: async (value: Schedule[]) => { mocks.schedules = value; },
  getSessionHistory: async () => mocks.sessions,
  setSessionHistory: async (value: FocusSession[]) => { mocks.sessions = value; },
  getReports: async () => [], setReports: async () => undefined,
  getSettings: async () => ({} as UserSettings), setSettings: async () => undefined,
} }));

import { createBlockingRules } from "../../background/blocking";
import { cloudSyncStorage } from "./storage";
import { cloudSyncService } from "./service";

const legacy: Schedule = {
  id: "legacy-plan", title: "로컬 계획", description: "", dateKey: "2026-10-02", startAt: "2026-10-02T00:00:00Z", endAt: "2026-10-02T00:05:00Z",
  targetFocusMinutes: 5, activityMode: "interactive", blockingMode: "blocklist", allowedDomains: [], blockedDomains: [{ hostname: "youtube.com", includeSubdomains: true }],
  breakMinutes: 5, status: "scheduled", snoozeCount: 0, createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
};
const canonical: Schedule = { ...legacy, id: "web-plan", ownerUserId: "11111111-1111-4111-8111-111111111111", status: "focusing" };
const session: FocusSession = { id: "web-session", scheduleId: canonical.id, dateKey: canonical.dateKey, startedAt: canonical.startAt, endedAt: null, pausedAt: null, accumulatedFocusSeconds: 0, distractionSeconds: 0, idleSeconds: 0, blockedAttemptCount: 0, checkInCount: 0, status: "active", canonical: true };
const record = (entityType: CloudRecord["entityType"], entityId: string, payload: CloudRecord["payload"], deletedAt: string | null = null): CloudRecord => ({ entityType, entityId, payload, version: 1, deviceId: "web", updatedAt: canonical.updatedAt, deletedAt });
function pending(entityId: string, payload: PendingCloudMutation["payload"]): PendingCloudMutation {
  return { mutationId: crypto.randomUUID(), entityType: "schedule", entityId, operation: "upsert", payload, expectedVersion: 0, deviceId: "old-version", createdAt: canonical.createdAt, attempts: 0 };
}
beforeEach(() => {
  mocks.schedules = [{ ...legacy }, { ...canonical }]; mocks.sessions = [{ ...session, status: "completed" }]; mocks.stored = {}; mocks.invoke.mockReset();
  vi.stubGlobal("chrome", {
    storage: { local: {
      get: async (key: string) => ({ [key]: mocks.stored[key] }),
      set: async (values: Record<string, unknown>) => { Object.assign(mocks.stored, values); },
      remove: async (keys: string[]) => { keys.forEach((key) => { delete mocks.stored[key]; }); },
    } },
    declarativeNetRequest: { RuleActionType: { ALLOW: "allow", REDIRECT: "redirect" }, ResourceType: { MAIN_FRAME: "main_frame" } },
  });
  mocks.invoke.mockImplementation(async (_name: string, request: { body: { action: string; mutations?: PendingCloudMutation[] } }) => ({ data: request.body.action === "push" ? { results: request.body.mutations!.map((item) => ({ mutationId: item.mutationId, status: "applied", record: record(item.entityType, item.entityId, item.payload) })) } : { records: [] }, error: null }));
});
afterEach(() => vi.unstubAllGlobals());

describe("legacy backup and canonical enforcement isolation", () => {
  it("backs up legacy plans/settings while canonical plans and results never enter the mutation batch", async () => {
    await cloudSyncService.initialBackup();
    const mutations = mocks.invoke.mock.calls.flatMap((call) => call[1].body.mutations ?? []);
    expect(mutations.map((item: PendingCloudMutation) => `${item.entityType}:${item.entityId}`)).toEqual(["schedule:legacy-plan", "settings:settings"]);
    expect(await cloudSyncStorage.getPending()).toEqual([]);
    expect((await cloudSyncStorage.getState()).initialized).toBe(true);
  });
  it("retires canonical mutations from an older version without losing legacy pending writes", async () => {
    await cloudSyncStorage.setPending([pending(canonical.id, { ...canonical }), pending(canonical.id, null), pending(legacy.id, { ...legacy })]);
    await cloudSyncStorage.setState({ ...(await cloudSyncStorage.getState()), initialized: true });
    await cloudSyncService.sync();
    const mutations = mocks.invoke.mock.calls.flatMap((call) => call[1].body.mutations ?? []);
    expect(mutations.map((item: PendingCloudMutation) => item.entityId)).toEqual([legacy.id]);
    expect(await cloudSyncStorage.getPending()).toEqual([]);
  });
  it("ignores canonical pull records and legacy tombstones so an offline restart can reconstruct DNR", async () => {
    const remote = [record("schedule", canonical.id, { id: canonical.id, ownerUserId: canonical.ownerUserId, plannedStartAt: null }),
      record("schedule", canonical.id, { ...legacy, id: canonical.id }, canonical.updatedAt),
      record("focus-session", session.id, { ...session, status: "success", ownerUserId: canonical.ownerUserId }),
      record("schedule", legacy.id, { ...legacy, title: "동기화된 로컬 계획" })];
    mocks.invoke.mockResolvedValue({ data: { records: remote }, error: null });
    await cloudSyncStorage.setState({ ...(await cloudSyncStorage.getState()), initialized: true });
    await cloudSyncService.sync();
    expect(mocks.schedules.find((item) => item.id === legacy.id)?.title).toBe("동기화된 로컬 계획");
    const persisted = JSON.parse(JSON.stringify(mocks.schedules)) as Schedule[];
    const restarted = persisted.find((item) => item.id === session.scheduleId);
    expect(restarted).toEqual(canonical);
    expect(createBlockingRules(restarted!, session, [], "chrome-extension://fixture/" )).toMatchObject([{ action: { type: "redirect" }, condition: { regexFilter: expect.stringContaining("youtube") } }]);
    expect(mocks.sessions[0].status).toBe("completed");
  });
  it("does not enqueue canonical upserts or deletes through storage change hooks", async () => {
    await cloudSyncStorage.queueScheduleChanges([], [canonical]);
    await cloudSyncStorage.queueScheduleChanges([canonical], []);
    await cloudSyncStorage.queueSessionChanges([], [{ ...session, status: "completed" }]);
    expect(await cloudSyncStorage.getPending()).toEqual([]);
    await cloudSyncStorage.queueScheduleChanges([], [legacy]);
    expect((await cloudSyncStorage.getPending()).map((item) => item.entityId)).toEqual([legacy.id]);
  });
});
