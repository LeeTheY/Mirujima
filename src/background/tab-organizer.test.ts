import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TabsApi } from "../shared/chrome/tabs-api";
import type { Schedule } from "../shared/types/models";

const values: Record<string, unknown> = {};
vi.stubGlobal("chrome", {
  storage: { local: {
    get: vi.fn(async (keys: string | string[] | null) => {
      if (keys === null) return { ...values };
      const selected = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(selected.map((key) => [key, values[key]]));
    }),
    set: vi.fn(async (patch: Record<string, unknown>) => { Object.assign(values, patch); })
  } },
  tabGroups: { TAB_GROUP_ID_NONE: -1 },
  windows: { WINDOW_ID_NONE: -1 }
});

const schedule: Schedule = {
  id: "schedule-1", title: "React 작업", description: "문서 확인", dateKey: "2026-07-16",
  startAt: "2026-07-16T00:00:00.000Z", endAt: "2026-07-16T01:00:00.000Z", targetFocusMinutes: 60,
  activityMode: "interactive", blockingMode: "allowlist", allowedDomains: [{ hostname: "github.com", includeSubdomains: true }],
  blockedDomains: [{ hostname: "netflix.com", includeSubdomains: true }], breakMinutes: 5, status: "scheduled", snoozeCount: 0,
  createdAt: "2026-07-16T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z"
};

function api(): TabsApi & { grouped: number[] } {
  const grouped: number[] = [];
  return {
    grouped,
    queryCurrentWindow: vi.fn(async () => [
      { id: 1, windowId: 7, index: 0, title: "Repo", url: "https://github.com/openai/project", pinned: false, active: true, groupId: -1 },
      { id: 2, windowId: 7, index: 1, title: "Netflix", url: "https://netflix.com/", pinned: false, active: false, groupId: -1 },
      { id: 3, windowId: 7, index: 2, title: "Pinned", url: "https://react.dev/", pinned: true, active: false, groupId: -1 },
      { id: 4, windowId: 7, index: 3, title: "Mine", url: "https://example.com/", pinned: false, active: false, groupId: 99 }
    ] as chrome.tabs.Tab[]),
    queryGroups: vi.fn(async () => [{ id: 99, windowId: 7, title: "내 그룹", color: "red", collapsed: false, shared: false } as chrome.tabGroups.TabGroup]),
    group: vi.fn(async (tabIds: number[], groupId?: number) => { grouped.push(...tabIds); return groupId ?? (tabIds[0] === 1 ? 10 : 11); }),
    ungroup: vi.fn(async () => undefined), updateGroup: vi.fn(async () => undefined), move: vi.fn(async () => []),
    updateTab: vi.fn(async () => undefined), getTab: vi.fn(async () => ({ id: 1 } as chrome.tabs.Tab))
  };
}

describe("탭 그룹화 통합", () => {
  beforeEach(() => { Object.keys(values).forEach((key) => delete values[key]); });
  it("허용/차단 탭은 분류하고 고정 탭과 사용자 그룹은 보존한다", async () => {
    const fake = api();
    const { organizeTabs } = await import("./tab-organizer");
    const result = await organizeTabs("manual", schedule, "session-1", fake);
    expect(fake.grouped).toEqual([1, 2]);
    expect(result.groups.find((group) => group.category === "work")?.tabIds).toEqual([1]);
    expect(result.groups.find((group) => group.category === "break")?.tabIds).toEqual([2]);
    expect(result.excludedTabs.map((item) => item.reason)).toEqual(expect.arrayContaining(["고정 탭 보존", "사용자 그룹 보존"]));
  });
  it("한 탭의 그룹화 실패 후에도 다른 탭을 계속 처리한다", async () => {
    const fake = api();
    fake.group = vi.fn(async (tabIds: number[]) => { if (tabIds[0] === 1) throw new Error("drag 중"); fake.grouped.push(...tabIds); return 11; });
    const { organizeTabs } = await import("./tab-organizer");
    const result = await organizeTabs("manual", schedule, "session-2", fake);
    expect(fake.grouped).toEqual([2]);
    expect(result.failedTabs).toEqual([{ tabId: 1, reason: "drag 중" }]);
    expect(result.groups.find((group) => group.category === "break")?.tabIds).toEqual([2]);
  });
  it("snapshot에 남은 기존 탭만 원래 순서와 그룹으로 복원한다", async () => {
    const fake = api();
    const { organizeTabs, restoreTabLayout } = await import("./tab-organizer");
    await organizeTabs("manual", schedule, "session-restore", fake);
    const restored = await restoreTabLayout("session-restore", fake);
    expect(restored.success).toBe(true);
    expect(fake.move).toHaveBeenCalledTimes(4);
    expect(fake.ungroup).toHaveBeenCalledTimes(3);
    expect(fake.group).toHaveBeenCalledWith([4], 99);
  });
  it("작업 탭 세트 저장 시 같은 URL을 중복 저장하지 않는다", async () => {
    const fake = api();
    fake.queryCurrentWindow = vi.fn(async () => [
      { id: 1, windowId: 7, index: 0, url: "https://github.com/openai/project", groupId: -1 },
      { id: 2, windowId: 7, index: 1, url: "https://github.com/openai/project", groupId: -1 }
    ] as chrome.tabs.Tab[]);
    const { saveCurrentWorkTabSet } = await import("./tab-organizer");
    const saved = await saveCurrentWorkTabSet("프로젝트", "schedule-1", fake);
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0]?.hostname).toBe("github.com");
  });
  it("사용자가 방금 이동한 탭은 자동 재분류하지 않는다", async () => {
    values["mirujima:tab-runtime-metadata"] = { "2": { openedDuringMode: "break", openedAt: new Date().toISOString(), manualUntil: new Date(Date.now() + 60_000).toISOString() } };
    const fake = api();
    const { organizeTabs } = await import("./tab-organizer");
    const result = await organizeTabs("realtime", schedule, "session-manual", fake);
    expect(fake.grouped).toEqual([1]);
    expect(result.excludedTabs).toContainEqual({ tabId: 2, reason: "최근 사용자 이동 보호" });
  });
  it("수동 탭 정리는 최근 이동 cooldown이 있어도 항상 다시 분류한다", async () => {
    values["mirujima:tab-runtime-metadata"] = { "1": { openedDuringMode: "idle", openedAt: new Date().toISOString(), manualUntil: new Date(Date.now() + 60_000).toISOString() }, "2": { openedDuringMode: "break", openedAt: new Date().toISOString(), manualUntil: new Date(Date.now() + 60_000).toISOString() } };
    const fake = api();
    const { organizeTabs } = await import("./tab-organizer");
    const result = await organizeTabs("manual", schedule, "session-force-manual", fake);
    expect(fake.grouped).toEqual([1, 2]);
    expect(result.excludedTabs).not.toContainEqual(expect.objectContaining({ reason: "최근 사용자 이동 보호" }));
  });
  it("분류 결과에 ID 대신 표시할 hostname과 짧은 제목을 포함한다", async () => {
    const fake = api();
    fake.queryCurrentWindow = vi.fn(async () => [{ id: 5, windowId: 7, index: 0, title: "어떤 사이트의 긴 페이지 제목", url: "https://unknown.example/path", pinned: false, active: true, groupId: -1 }] as chrome.tabs.Tab[]);
    const { organizeTabs } = await import("./tab-organizer");
    const result = await organizeTabs("manual", schedule, "session-details", fake);
    expect(result.tabDetails).toEqual([{ tabId: 5, hostname: "unknown.example", title: "어떤 사이트의 긴 페이지 제목" }]);
  });
});
