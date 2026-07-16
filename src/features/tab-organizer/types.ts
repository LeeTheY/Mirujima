import type { ActivityMode, BlockingMode, DomainRule, TabCategory } from "../../shared/types/models";

export interface TabContext {
  tabId: number;
  windowId: number;
  index: number;
  title: string | null;
  url: string | null;
  hostname: string | null;
  pinned: boolean;
  active: boolean;
  openerTabId?: number;
  currentGroupId: number;
  openedDuringMode?: "focus" | "break" | "idle";
}

export interface TabClassificationContext {
  scheduleId: string;
  scheduleTitle: string;
  scheduleDescription: string;
  activityMode: ActivityMode;
  blockingMode: BlockingMode;
  allowedDomains: DomainRule[];
  blockedDomains: DomainRule[];
  taskKeywords: string[];
  workTabUrls?: string[];
  workTabHostnames?: string[];
}

export interface UserTabClassificationRule {
  id: string;
  hostname: string;
  category: TabCategory;
  scope: "global" | "schedule";
  scheduleId?: string;
  titleKeyword?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassificationReason { code: string; label: string; scoreDelta: number }
export interface TabClassification {
  tabId: number;
  category: TabCategory;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: ClassificationReason[];
}

export interface FocusTabSnapshotItem { tabId: number; index: number; pinned: boolean; groupId: number; url?: string; title?: string; active: boolean }
export interface FocusTabSnapshotGroup { groupId: number; title?: string; color: `${chrome.tabGroups.Color}`; collapsed: boolean }
export interface FocusTabSnapshot {
  id: string;
  sessionId: string;
  windowId: number;
  createdAt: string;
  activeTabId?: number;
  tabs: FocusTabSnapshotItem[];
  groups: FocusTabSnapshotGroup[];
}

export interface WorkTabSetItem { id: string; url: string; hostname: string; category: Exclude<TabCategory, "unclassified">; order: number }
export interface WorkTabSet { id: string; name: string; scheduleId?: string; items: WorkTabSetItem[]; createdAt: string; updatedAt: string; lastUsedAt?: string }

export interface TabRuntimeMetadata { openedDuringMode: "focus" | "break" | "idle"; openedAt: string; manualUntil?: string }

export interface OrganizeTabsResult {
  success: boolean;
  windowId: number;
  trigger: "focus-start" | "focus-resume" | "manual" | "realtime";
  groups: Array<{ category: TabCategory; title: string; groupId?: number; tabIds: number[] }>;
  excludedTabs: Array<{ tabId: number; reason: string }>;
  failedTabs: Array<{ tabId: number; reason: string }>;
  tabDetails: Array<{ tabId: number; hostname: string; title: string | null }>;
  snapshotId?: string;
}
