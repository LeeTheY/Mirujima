import { tabsApi, type TabsApi } from "../shared/chrome/tabs-api";
import { repository } from "../shared/storage/repository";
import type { Schedule, TabCategory } from "../shared/types/models";
import { createId } from "../shared/utils/id";
import { classifyTab, groupTitle, hostnameFromTabUrl } from "../features/tab-organizer/classifier";
import { tabOrganizerRepository } from "../features/tab-organizer/repository";
import type { FocusTabSnapshot, OrganizeTabsResult, TabClassificationContext, TabContext, UserTabClassificationRule, WorkTabSet } from "../features/tab-organizer/types";

const GROUP_STYLE: Record<TabCategory, { color: `${chrome.tabGroups.Color}`; collapsed: boolean }> = {
  work: { color: "blue", collapsed: false },
  reference: { color: "green", collapsed: false },
  communication: { color: "purple", collapsed: false },
  break: { color: "orange", collapsed: true },
  unclassified: { color: "grey", collapsed: false }
};
const MANAGED_PREFIXES = ["🎯", "📚", "💬", "☕", "📦"];
let organizing: Promise<OrganizeTabsResult> | null = null;
const automationMovingTabs = new Set<number>();

function isManagedGroup(group: chrome.tabGroups.TabGroup | undefined): boolean {
  return Boolean(group?.title && MANAGED_PREFIXES.some((prefix) => group.title!.startsWith(prefix)));
}

function taskKeywords(schedule: Schedule): string[] {
  return `${schedule.title} ${schedule.description}`.split(/[\s,./_-]+/).map((item) => item.trim()).filter((item) => item.length >= 2);
}

async function createSnapshot(sessionId: string, tabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]): Promise<FocusTabSnapshot> {
  const windowId = tabs[0]?.windowId;
  if (windowId === undefined) throw new Error("현재 Chrome 창을 찾을 수 없습니다.");
  const previous = await tabOrganizerRepository.getActiveSnapshot();
  if (previous && previous.sessionId !== sessionId) await tabOrganizerRepository.setRecentSnapshots([...(await tabOrganizerRepository.getRecentSnapshots()), previous]);
  const snapshot: FocusTabSnapshot = {
    id: createId("tab-snapshot"), sessionId, windowId, createdAt: new Date().toISOString(),
    activeTabId: tabs.find((tab) => tab.active)?.id,
    tabs: tabs.flatMap((tab) => tab.id === undefined ? [] : [{ tabId: tab.id, index: tab.index, pinned: tab.pinned, groupId: tab.groupId, url: tab.url, title: tab.title, active: tab.active }]),
    groups: groups.map((group) => ({ groupId: group.id, title: group.title, color: group.color, collapsed: group.collapsed }))
  };
  await tabOrganizerRepository.setActiveSnapshot(snapshot);
  return snapshot;
}

function toContext(tab: chrome.tabs.Tab, openedDuringMode?: "focus" | "break" | "idle"): TabContext | null {
  if (tab.id === undefined || tab.windowId === undefined) return null;
  return { tabId: tab.id, windowId: tab.windowId, index: tab.index, title: tab.title ?? null, url: tab.url ?? null, hostname: hostnameFromTabUrl(tab.url ?? null), pinned: tab.pinned, active: tab.active, openerTabId: tab.openerTabId, currentGroupId: tab.groupId, openedDuringMode };
}

async function organize(trigger: OrganizeTabsResult["trigger"], schedule: Schedule, sessionId: string, api: TabsApi): Promise<OrganizeTabsResult> {
  const settings = await tabOrganizerRepository.getSettings();
  const tabs = await api.queryCurrentWindow();
  const windowId = tabs[0]?.windowId ?? chrome.windows.WINDOW_ID_NONE;
  if (!settings.enabled) return { success: true, windowId, trigger, groups: [], excludedTabs: [], failedTabs: [], tabDetails: [] };
  if (tabs.length === 0 || windowId === chrome.windows.WINDOW_ID_NONE) throw new Error("정리할 일반 Chrome 창이 없습니다.");
  const currentGroups = await api.queryGroups(windowId);
  const groupById = new Map(currentGroups.map((group) => [group.id, group]));
  let snapshot = await tabOrganizerRepository.getActiveSnapshot();
  if (!snapshot || snapshot.sessionId !== sessionId || snapshot.windowId !== windowId) snapshot = await createSnapshot(sessionId, tabs, currentGroups);
  const rules = await tabOrganizerRepository.getRules();
  const runtimeMetadata = await tabOrganizerRepository.getRuntimeMetadata();
  const workSetItems = (await tabOrganizerRepository.getWorkTabSets()).filter((set) => set.scheduleId === schedule.id).flatMap((set) => set.items);
  const context: TabClassificationContext = {
    scheduleId: schedule.id, scheduleTitle: schedule.title, scheduleDescription: schedule.description,
    activityMode: schedule.activityMode, blockingMode: schedule.blockingMode,
    allowedDomains: schedule.allowedDomains, blockedDomains: schedule.blockedDomains, taskKeywords: taskKeywords(schedule),
    workTabUrls: workSetItems.map((item) => item.url), workTabHostnames: workSetItems.map((item) => item.hostname)
  };
  const excludedTabs: OrganizeTabsResult["excludedTabs"] = [];
  const candidates: TabContext[] = [];
  for (const tab of tabs) {
    const candidate = toContext(tab, tab.id === undefined ? undefined : runtimeMetadata[String(tab.id)]?.openedDuringMode);
    if (!candidate) continue;
    if (!candidate.hostname) { excludedTabs.push({ tabId: candidate.tabId, reason: "Chrome 제한 페이지 또는 URL 정보 없음" }); continue; }
    if (candidate.pinned && !settings.includePinnedTabs) { excludedTabs.push({ tabId: candidate.tabId, reason: "고정 탭 보존" }); continue; }
    const manualUntil = runtimeMetadata[String(candidate.tabId)]?.manualUntil;
    if (trigger !== "manual" && manualUntil && new Date(manualUntil).getTime() > Date.now()) { excludedTabs.push({ tabId: candidate.tabId, reason: "최근 사용자 이동 보호" }); continue; }
    if (settings.preserveUserGroups && candidate.currentGroupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && !isManagedGroup(groupById.get(candidate.currentGroupId))) {
      excludedTabs.push({ tabId: candidate.tabId, reason: "사용자 그룹 보존" }); continue;
    }
    candidates.push(candidate);
  }
  const classifications = candidates.map((tab) => {
    const opener = tab.openerTabId === undefined ? undefined : candidates.find((item) => item.tabId === tab.openerTabId);
    const openerClassification = opener ? classifyTab(opener, context, rules).category : undefined;
    return classifyTab(tab, context, rules, openerClassification);
  });
  const resultGroups: OrganizeTabsResult["groups"] = [];
  const failedTabs: OrganizeTabsResult["failedTabs"] = [];
  for (const category of ["work", "reference", "communication", "break", "unclassified"] as const) {
    const tabIds = classifications.filter((item) => item.category === category).map((item) => item.tabId);
    if (tabIds.length === 0) continue;
    const title = groupTitle(category, category === "work" ? schedule.title : undefined);
    const existing = currentGroups.find((group) => group.title === title);
    const successful: number[] = [];
    let groupId = existing?.id;
    for (const tabId of tabIds) {
      try {
        automationMovingTabs.add(tabId);
        groupId = await api.group([tabId], groupId);
        successful.push(tabId);
      }
      catch (error) { failedTabs.push({ tabId, reason: error instanceof Error ? error.message : "탭 이동 실패" }); }
      finally { setTimeout(() => automationMovingTabs.delete(tabId), 500); }
    }
    if (groupId !== undefined && successful.length > 0) {
      const style = GROUP_STYLE[category];
      try { await api.updateGroup(groupId, { title, color: style.color, collapsed: style.collapsed }); }
      catch (error) { successful.forEach((tabId) => failedTabs.push({ tabId, reason: error instanceof Error ? error.message : "그룹 설정 실패" })); }
      resultGroups.push({ category, title, groupId, tabIds: successful });
    }
  }
  const workTab = resultGroups.find((group) => group.category === "work")?.tabIds[0];
  if (settings.activateWorkTabAfterOrganize && workTab !== undefined) {
    try { await api.updateTab(workTab, { active: true }); } catch { /* 결과 적용은 유지 */ }
  }
  const counts = { work: 0, reference: 0, communication: 0, break: 0, unclassified: 0 };
  resultGroups.forEach((group) => { counts[group.category] += group.tabIds.length; });
  await tabOrganizerRepository.setSummary({ lastOrganizedAt: new Date().toISOString(), lastSnapshotId: snapshot.id, counts });
  return {
    success: resultGroups.length > 0 || failedTabs.length === 0, windowId, trigger, groups: resultGroups, excludedTabs, failedTabs,
    tabDetails: candidates.map((tab) => ({ tabId: tab.tabId, hostname: tab.hostname!, title: tab.title?.trim().slice(0, 100) || null })), snapshotId: snapshot.id
  };
}

export async function organizeTabs(trigger: OrganizeTabsResult["trigger"], schedule: Schedule, sessionId: string, api: TabsApi = tabsApi): Promise<OrganizeTabsResult> {
  if (organizing) return organizing;
  organizing = organize(trigger, schedule, sessionId, api).finally(() => { organizing = null; });
  return organizing;
}

export async function organizeActiveSession(trigger: OrganizeTabsResult["trigger"], api: TabsApi = tabsApi): Promise<OrganizeTabsResult> {
  const session = await repository.getActiveSession();
  if (!session) throw new Error("진행 중인 집중 세션이 없습니다.");
  const schedule = (await repository.getSchedules()).find((item) => item.id === session.scheduleId);
  if (!schedule) throw new Error("일정을 찾을 수 없습니다.");
  return organizeTabs(trigger, schedule, session.id, api);
}

export async function safelyOrganizeActiveSession(trigger: "focus-start" | "focus-resume"): Promise<void> {
  try {
    const settings = await tabOrganizerRepository.getSettings();
    if ((trigger === "focus-start" && !settings.organizeOnFocusStart) || (trigger === "focus-resume" && !settings.organizeOnFocusResume)) return;
    await organizeActiveSession(trigger);
  } catch (error) {
    console.warn("미루지마 탭 자동 정리를 건너뛰었습니다.", error);
  }
}

export async function restoreTabLayout(sessionId: string, api: TabsApi = tabsApi): Promise<OrganizeTabsResult> {
  const snapshot = await tabOrganizerRepository.getActiveSnapshot();
  if (!snapshot || snapshot.sessionId !== sessionId) throw new Error("복원할 탭 배치가 없습니다.");
  const failedTabs: OrganizeTabsResult["failedTabs"] = [];
  for (const item of [...snapshot.tabs].sort((a, b) => a.index - b.index)) {
    try {
      automationMovingTabs.add(item.tabId);
      await api.getTab(item.tabId);
      await api.move(item.tabId, item.index);
      await api.updateTab(item.tabId, { pinned: item.pinned });
      if (item.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) await api.ungroup(item.tabId);
      else await api.group([item.tabId], item.groupId);
    } catch (error) { failedTabs.push({ tabId: item.tabId, reason: error instanceof Error ? error.message : "복원 실패" }); }
    finally { setTimeout(() => automationMovingTabs.delete(item.tabId), 500); }
  }
  for (const group of snapshot.groups) {
    try { await api.updateGroup(group.groupId, { title: group.title, color: group.color, collapsed: group.collapsed }); } catch { /* 사라진 그룹은 무시 */ }
  }
  if (snapshot.activeTabId !== undefined) { try { await api.updateTab(snapshot.activeTabId, { active: true }); } catch { /* 닫힌 탭 */ } }
  if (failedTabs.length === 0) await tabOrganizerRepository.setActiveSnapshot(null);
  return { success: failedTabs.length < snapshot.tabs.length, windowId: snapshot.windowId, trigger: "manual", groups: [], excludedTabs: [], failedTabs, tabDetails: [], snapshotId: snapshot.id };
}

export async function finalizeTabSnapshot(sessionId: string): Promise<void> {
  const snapshot = await tabOrganizerRepository.getActiveSnapshot();
  if (!snapshot || snapshot.sessionId !== sessionId) return;
  await tabOrganizerRepository.setRecentSnapshots([...(await tabOrganizerRepository.getRecentSnapshots()), snapshot]);
  await tabOrganizerRepository.setActiveSnapshot(null);
  await tabOrganizerRepository.pruneSnapshots();
}

export async function rememberClassification(tabId: number, category: TabCategory, remember: "once" | "schedule" | "global", api: TabsApi = tabsApi): Promise<void> {
  const tab = await api.getTab(tabId);
  const hostname = hostnameFromTabUrl(tab.url ?? null);
  if (!hostname) throw new Error("이 탭의 hostname은 기억할 수 없습니다.");
  const session = await repository.getActiveSession();
  const schedule = session ? (await repository.getSchedules()).find((item) => item.id === session.scheduleId) : undefined;
  if (category !== "unclassified" && tab.windowId !== undefined) {
    const title = groupTitle(category, category === "work" ? schedule?.title : undefined);
    const existing = (await api.queryGroups(tab.windowId)).find((group) => group.title === title);
    const groupId = await api.group([tabId], existing?.id);
    await api.updateGroup(groupId, { title, ...GROUP_STYLE[category] });
  }
  if (remember === "once") return;
  if (remember === "schedule" && !session) throw new Error("일정별로 기억하려면 집중 세션이 필요합니다.");
  const now = new Date().toISOString();
  const rules = await tabOrganizerRepository.getRules();
  const rule: UserTabClassificationRule = { id: createId("tab-rule"), hostname, category, scope: remember === "global" ? "global" : "schedule", scheduleId: remember === "schedule" ? session?.scheduleId : undefined, createdAt: now, updatedAt: now };
  await tabOrganizerRepository.setRules([...rules.filter((item) => !(item.hostname === hostname && item.scope === rule.scope && item.scheduleId === rule.scheduleId)), rule]);
}

export async function saveCurrentWorkTabSet(name: string, scheduleId?: string, api: TabsApi = tabsApi): Promise<WorkTabSet> {
  const tabs = await api.queryCurrentWindow();
  const seen = new Set<string>();
  const items = tabs.flatMap((tab, order) => {
    const url = tab.url;
    const hostname = hostnameFromTabUrl(url ?? null);
    if (!url || !hostname || seen.has(url)) return [];
    seen.add(url);
    return [{ id: createId("work-tab"), url, hostname, category: "work" as const, order }];
  });
  const now = new Date().toISOString();
  const tabSet: WorkTabSet = { id: createId("work-set"), name: name.trim() || "현재 작업", scheduleId, items, createdAt: now, updatedAt: now };
  await tabOrganizerRepository.setWorkTabSets([...(await tabOrganizerRepository.getWorkTabSets()), tabSet]);
  return tabSet;
}

export async function setBreakGroupExpanded(expanded: boolean, api: TabsApi = tabsApi): Promise<void> {
  const tabs = await api.queryCurrentWindow();
  const windowId = tabs[0]?.windowId;
  if (windowId === undefined) return;
  const group = (await api.queryGroups(windowId)).find((item) => item.title === "☕ 휴식 탭");
  if (group) await api.updateGroup(group.id, { collapsed: !expanded });
}

export async function recordNewTabMode(tabId: number): Promise<void> {
  const settings = await tabOrganizerRepository.getSettings();
  if (!settings.rememberBreakOpenedTabs) return;
  const session = await repository.getActiveSession();
  const openedDuringMode = session?.status === "active" ? "focus" : session?.status === "paused" && session.breakStartedAt ? "break" : "idle";
  const metadata = await tabOrganizerRepository.getRuntimeMetadata();
  metadata[String(tabId)] = { openedDuringMode, openedAt: new Date().toISOString() };
  await tabOrganizerRepository.setRuntimeMetadata(metadata);
}

export function isAutomationMovingTab(tabId: number): boolean { return automationMovingTabs.has(tabId); }

export async function recordManualTabMove(tabId: number): Promise<void> {
  if (isAutomationMovingTab(tabId)) return;
  const metadata = await tabOrganizerRepository.getRuntimeMetadata();
  const current = metadata[String(tabId)] ?? { openedDuringMode: "idle" as const, openedAt: new Date().toISOString() };
  metadata[String(tabId)] = { ...current, manualUntil: new Date(Date.now() + 5 * 60_000).toISOString() };
  await tabOrganizerRepository.setRuntimeMetadata(metadata);
}

export async function realtimeOrganizeIfEnabled(): Promise<void> {
  try {
    const [settings, session] = await Promise.all([tabOrganizerRepository.getSettings(), repository.getActiveSession()]);
    if (!settings.enabled || !settings.classifyNewTabsDuringFocus || session?.status !== "active") return;
    await organizeActiveSession("realtime");
  } catch (error) { console.warn("새 탭 자동 분류를 건너뛰었습니다.", error); }
}
