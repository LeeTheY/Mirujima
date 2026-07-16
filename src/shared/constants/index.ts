import type { TabOrganizerSettings, TabOrganizerSummary, UserSettings } from "../types/models";

export const DEFAULT_MAIN_UI = "sidepanel" as const;
export const CURRENT_SCHEMA_VERSION = 1;
export const EVENT_RETENTION_DAYS = 30;
export const DNR_RULE_ID_START = 20_000;
export const DNR_RULE_ID_END = 29_999;
export const NOTIFICATION_COOLDOWN_MS = 10 * 60 * 1000;

export const STORAGE_KEYS = {
  schemaVersion: "mirujima:schema-version",
  schedules: "mirujima:schedules",
  activeSession: "mirujima:active-session",
  sessionHistory: "mirujima:session-history",
  activityEvents: "mirujima:activity-events",
  reports: "mirujima:reports",
  settings: "mirujima:settings",
  notificationState: "mirujima:notification-state",
  temporaryAllows: "mirujima:temporary-allows",
  tabOrganizerSchemaVersion: "mirujima:tab-organizer-schema-version",
  tabOrganizerSettings: "mirujima:tab-organizer-settings",
  tabClassificationRules: "mirujima:tab-classification-rules",
  workTabSets: "mirujima:work-tab-sets",
  activeTabSnapshot: "mirujima:active-tab-snapshot",
  recentTabSnapshots: "mirujima:recent-tab-snapshots",
  tabRuntimeMetadata: "mirujima:tab-runtime-metadata",
  tabOrganizerSummary: "mirujima:tab-organizer-summary",
  membershipCache: "mirujima:membership-cache",
  membershipDeviceId: "mirujima:membership-device-id",
  cloudPendingMutations: "mirujima:cloud-pending-mutations",
  cloudRecordMetadata: "mirujima:cloud-record-metadata",
  cloudSyncState: "mirujima:cloud-sync-state",
  cloudLearningDays: "mirujima:cloud-learning-days",
  cloudRestoreRecords: "mirujima:cloud-restore-records"
} as const;

export const TAB_ORGANIZER_SCHEMA_VERSION = 1;
export const DEFAULT_TAB_ORGANIZER_SETTINGS: TabOrganizerSettings = {
  enabled: true,
  organizeOnFocusStart: true,
  organizeOnFocusResume: true,
  classifyNewTabsDuringFocus: false,
  rememberBreakOpenedTabs: true,
  collapseBreakGroupOnFocus: true,
  expandBreakGroupOnBreak: true,
  activateWorkTabAfterOrganize: true,
  activateLastBreakTabOnBreak: false,
  restoreLayoutOnFinish: "ask",
  preserveUserGroups: true,
  includePinnedTabs: false,
  rememberCorrections: true
};

export const EMPTY_TAB_ORGANIZER_SUMMARY: TabOrganizerSummary = {
  counts: { work: 0, reference: 0, communication: 0, break: 0, unclassified: 0 }
};

export const DEFAULT_SETTINGS: UserSettings = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  onboardingCompleted: false,
  mainUI: DEFAULT_MAIN_UI,
  defaultBlockingMode: "allowlist",
  idleThresholdMinutes: 5,
  notificationsEnabled: true,
  distractionWarningsEnabled: true,
  activityHeartbeatEnabled: true,
  dailyReportEnabled: true,
  defaultBlockedDomains: []
};

export const ALARM_PREFIX = {
  schedule: "schedule:",
  focusEnd: "focus-end:",
  breakEnd: "break-end:",
  focusCheck: "focus-check",
  temporaryAllow: "temporary-allow:",
  dailyReport: "daily-report",
  cloudSync: "cloud-sync"
} as const;
