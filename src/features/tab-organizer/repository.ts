import { DEFAULT_TAB_ORGANIZER_SETTINGS, EMPTY_TAB_ORGANIZER_SUMMARY, STORAGE_KEYS, TAB_ORGANIZER_SCHEMA_VERSION } from "../../shared/constants";
import type { TabOrganizerSettings, TabOrganizerSummary } from "../../shared/types/models";
import type { FocusTabSnapshot, TabRuntimeMetadata, UserTabClassificationRule, WorkTabSet } from "./types";

function storage(): chrome.storage.StorageArea { return chrome.storage.local; }
async function get<T>(key: string, fallback: T): Promise<T> { const values = await storage().get(key); return (values[key] as T | undefined) ?? fallback; }
async function set<T>(key: string, value: T): Promise<void> { await storage().set({ [key]: value }); }

export function migrateTabOrganizerSettings(value: unknown): TabOrganizerSettings {
  const raw = typeof value === "object" && value !== null ? value as Partial<TabOrganizerSettings> : {};
  return { ...DEFAULT_TAB_ORGANIZER_SETTINGS, ...raw };
}

export const tabOrganizerRepository = {
  async initialize(): Promise<void> {
    const values = await storage().get([STORAGE_KEYS.tabOrganizerSettings, STORAGE_KEYS.tabOrganizerSchemaVersion]);
    await storage().set({
      [STORAGE_KEYS.tabOrganizerSchemaVersion]: TAB_ORGANIZER_SCHEMA_VERSION,
      [STORAGE_KEYS.tabOrganizerSettings]: migrateTabOrganizerSettings(values[STORAGE_KEYS.tabOrganizerSettings])
    });
    await this.pruneSnapshots();
  },
  async getSettings(): Promise<TabOrganizerSettings> { return migrateTabOrganizerSettings(await get(STORAGE_KEYS.tabOrganizerSettings, DEFAULT_TAB_ORGANIZER_SETTINGS)); },
  setSettings: (value: TabOrganizerSettings) => set(STORAGE_KEYS.tabOrganizerSettings, value),
  getRules: () => get<UserTabClassificationRule[]>(STORAGE_KEYS.tabClassificationRules, []),
  setRules: (value: UserTabClassificationRule[]) => set(STORAGE_KEYS.tabClassificationRules, value),
  getWorkTabSets: () => get<WorkTabSet[]>(STORAGE_KEYS.workTabSets, []),
  setWorkTabSets: (value: WorkTabSet[]) => set(STORAGE_KEYS.workTabSets, value),
  getActiveSnapshot: () => get<FocusTabSnapshot | null>(STORAGE_KEYS.activeTabSnapshot, null),
  setActiveSnapshot: (value: FocusTabSnapshot | null) => set(STORAGE_KEYS.activeTabSnapshot, value),
  getRecentSnapshots: () => get<FocusTabSnapshot[]>(STORAGE_KEYS.recentTabSnapshots, []),
  setRecentSnapshots: (value: FocusTabSnapshot[]) => set(STORAGE_KEYS.recentTabSnapshots, value),
  getSummary: () => get<TabOrganizerSummary>(STORAGE_KEYS.tabOrganizerSummary, EMPTY_TAB_ORGANIZER_SUMMARY),
  setSummary: (value: TabOrganizerSummary) => set(STORAGE_KEYS.tabOrganizerSummary, value),
  getRuntimeMetadata: () => get<Record<string, TabRuntimeMetadata>>(STORAGE_KEYS.tabRuntimeMetadata, {}),
  setRuntimeMetadata: (value: Record<string, TabRuntimeMetadata>) => set(STORAGE_KEYS.tabRuntimeMetadata, value),
  async pruneSnapshots(now = Date.now()): Promise<void> {
    const cutoff = now - 7 * 24 * 60 * 60 * 1000;
    const snapshots = await this.getRecentSnapshots();
    const retained = snapshots.filter((item) => new Date(item.createdAt).getTime() >= cutoff);
    if (retained.length !== snapshots.length) await this.setRecentSnapshots(retained);
  }
};
