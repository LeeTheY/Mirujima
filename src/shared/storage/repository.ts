import { CURRENT_SCHEMA_VERSION, DEFAULT_SETTINGS, EMPTY_TAB_ORGANIZER_SUMMARY, EVENT_RETENTION_DAYS, STORAGE_KEYS } from "../constants";
import { dateKeyDaysAgo } from "../time/time";
import type {
  ActivityEvent,
  AppSnapshot,
  DailyReport,
  FocusSession,
  NotificationState,
  Schedule,
  TemporaryAllow,
  UserSettings
} from "../types/models";
import { migrateSettings } from "./migrations";
import { tabOrganizerRepository } from "../../features/tab-organizer/repository";
import { getMembershipCache, protectMembershipStorage } from "../../features/membership/storage";
import { cloudSyncStorage } from "../../features/cloud-sync/storage";

export type StorageArea = Pick<chrome.storage.StorageArea, "get" | "set" | "remove" | "clear">;

function area(): StorageArea {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    throw new Error("Chrome 저장소를 사용할 수 없습니다.");
  }
  return chrome.storage.local;
}

async function getValue<T>(key: string, fallback: T): Promise<T> {
  const values = await area().get(key);
  const value: unknown = values[key];
  return value === undefined ? fallback : value as T;
}

async function setValue<T>(key: string, value: T): Promise<void> {
  await area().set({ [key]: value });
}

export const repository = {
  async initialize(): Promise<void> {
    await protectMembershipStorage();
    const values = await area().get([STORAGE_KEYS.schemaVersion, STORAGE_KEYS.settings]);
    const settings = migrateSettings({
      schemaVersion: values[STORAGE_KEYS.schemaVersion],
      settings: values[STORAGE_KEYS.settings]
    });
    await area().set({
      [STORAGE_KEYS.schemaVersion]: CURRENT_SCHEMA_VERSION,
      [STORAGE_KEYS.settings]: settings
    });
    await tabOrganizerRepository.initialize();
    await this.pruneEvents();
  },

  async getSnapshot(): Promise<AppSnapshot> {
    const values = await area().get(Object.values(STORAGE_KEYS));
    const settings = migrateSettings({
      schemaVersion: values[STORAGE_KEYS.schemaVersion],
      settings: values[STORAGE_KEYS.settings]
    });
    return {
      schedules: Array.isArray(values[STORAGE_KEYS.schedules]) ? values[STORAGE_KEYS.schedules] as Schedule[] : [],
      activeSession: (values[STORAGE_KEYS.activeSession] as FocusSession | null | undefined) ?? null,
      reports: Array.isArray(values[STORAGE_KEYS.reports]) ? values[STORAGE_KEYS.reports] as DailyReport[] : [],
      settings,
      notificationState: (values[STORAGE_KEYS.notificationState] as NotificationState | undefined) ?? {},
      temporaryAllows: Array.isArray(values[STORAGE_KEYS.temporaryAllows]) ? values[STORAGE_KEYS.temporaryAllows] as TemporaryAllow[] : [],
      tabOrganizerSettings: await tabOrganizerRepository.getSettings(),
      tabOrganizerSummary: (values[STORAGE_KEYS.tabOrganizerSummary] as import("../types/models").TabOrganizerSummary | undefined) ?? EMPTY_TAB_ORGANIZER_SUMMARY,
      membership: await getMembershipCache(),
      cloudSync: await cloudSyncStorage.getSnapshot()
    };
  },

  getSchedules: () => getValue<Schedule[]>(STORAGE_KEYS.schedules, []),
  async setSchedules(value: Schedule[]): Promise<void> {
    const previous = await this.getSchedules();
    await setValue(STORAGE_KEYS.schedules, value);
    try { await cloudSyncStorage.queueScheduleChanges(previous, value); } catch (error) { console.warn("일정 cloud mutation을 저장하지 못했습니다.", error); }
  },
  getActiveSession: () => getValue<FocusSession | null>(STORAGE_KEYS.activeSession, null),
  setActiveSession: (value: FocusSession | null) => setValue(STORAGE_KEYS.activeSession, value),
  getSessionHistory: () => getValue<FocusSession[]>(STORAGE_KEYS.sessionHistory, []),
  async setSessionHistory(value: FocusSession[]): Promise<void> {
    const previous = await this.getSessionHistory();
    await setValue(STORAGE_KEYS.sessionHistory, value);
    try { await cloudSyncStorage.queueSessionChanges(previous, value); } catch (error) { console.warn("세션 cloud mutation을 저장하지 못했습니다.", error); }
  },
  getEvents: () => getValue<ActivityEvent[]>(STORAGE_KEYS.activityEvents, []),
  setEvents: (value: ActivityEvent[]) => setValue(STORAGE_KEYS.activityEvents, value),
  getReports: () => getValue<DailyReport[]>(STORAGE_KEYS.reports, []),
  async setReports(value: DailyReport[]): Promise<void> {
    const previous = await this.getReports();
    await setValue(STORAGE_KEYS.reports, value);
    try { await cloudSyncStorage.queueReportChanges(previous, value); } catch (error) { console.warn("리포트 cloud mutation을 저장하지 못했습니다.", error); }
  },
  getSettings: () => getValue<UserSettings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  async setSettings(value: UserSettings): Promise<void> {
    await setValue(STORAGE_KEYS.settings, value);
    try { await cloudSyncStorage.queueSettings(value); } catch (error) { console.warn("설정 cloud mutation을 저장하지 못했습니다.", error); }
  },
  getNotificationState: () => getValue<NotificationState>(STORAGE_KEYS.notificationState, {}),
  setNotificationState: (value: NotificationState) => setValue(STORAGE_KEYS.notificationState, value),
  getTemporaryAllows: () => getValue<TemporaryAllow[]>(STORAGE_KEYS.temporaryAllows, []),
  setTemporaryAllows: (value: TemporaryAllow[]) => setValue(STORAGE_KEYS.temporaryAllows, value),

  async appendEvent(event: ActivityEvent): Promise<void> {
    const events = await this.getEvents();
    await this.setEvents([...events, event]);
  },

  async pruneEvents(now = new Date()): Promise<void> {
    const cutoff = dateKeyDaysAgo(EVENT_RETENTION_DAYS, now);
    const events = await this.getEvents();
    const retained = events.filter((event) => event.occurredAt.slice(0, 10) >= cutoff);
    if (retained.length !== events.length) await this.setEvents(retained);
  },

  async clearAll(): Promise<void> {
    await area().clear();
    await this.initialize();
  },

  async exportAll(): Promise<Record<string, unknown>> {
    const values = await area().get(null);
    return { exportedAt: new Date().toISOString(), ...values };
  },

  subscribe(listener: () => void): () => void {
    const handler = (_changes: Record<string, chrome.storage.StorageChange>, namespace: string) => {
      if (namespace === "local") listener();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }
};
