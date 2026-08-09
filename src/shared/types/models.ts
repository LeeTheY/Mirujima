export type MainUI = "sidepanel" | "popup";
export type ActivityMode = "interactive" | "reading" | "watching" | "offline";
export type BlockingMode = "allowlist" | "blocklist" | "off";
export type ScheduleStatus =
  | "scheduled"
  | "snoozed"
  | "focusing"
  | "paused"
  | "completed"
  | "cancelled"
  | "incomplete";

export interface DomainRule {
  hostname: string;
  includeSubdomains: boolean;
}

export interface Schedule {
  id: string;
  title: string;
  description: string;
  dateKey: string;
  startAt: string;
  endAt: string;
  targetFocusMinutes: number;
  activityMode: ActivityMode;
  blockingMode: BlockingMode;
  allowedDomains: DomainRule[];
  blockedDomains: DomainRule[];
  breakMinutes: number;
  status: ScheduleStatus;
  snoozeCount: number;
  snoozedUntil?: string;
  createdAt: string;
  updatedAt: string;
  ownerUserId?: string;
  plannedStartAt?: string | null;
  priority?: "low" | "medium" | "high";
  selfDepositPoints?: number;
  guardianRewardRequestPoints?: number;
  webStatus?: "draft" | "planned" | "ready" | "active" | "completed" | "failed" | "cancelled";
}

export interface FocusSession {
  id: string;
  scheduleId: string;
  dateKey: string;
  startedAt: string;
  endedAt: string | null;
  pausedAt: string | null;
  accumulatedFocusSeconds: number;
  distractionSeconds: number;
  idleSeconds: number;
  blockedAttemptCount: number;
  checkInCount: number;
  status: "active" | "paused" | "awaiting-result" | "completed" | "cancelled";
  breakEndsAt?: string | null;
  breakStartedAt?: string | null;
  accumulatedBreakSeconds?: number;
  endsAt?: string;
  canonical?: boolean;
}

export type ActivityEventType =
  | "heartbeat"
  | "blocked-attempt"
  | "temporary-allow"
  | "idle-start"
  | "idle-end"
  | "break-start"
  | "break-end"
  | "check-in"
  | "snooze";

export interface ActivityEvent {
  id: string;
  scheduleId: string;
  sessionId: string;
  type: ActivityEventType;
  hostname?: string;
  occurredAt: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface DailyReport {
  id: string;
  dateKey: string;
  plannedCount: number;
  completedCount: number;
  incompleteCount: number;
  achievementRate: number;
  plannedFocusMinutes: number;
  actualFocusMinutes: number;
  focusRate: number;
  snoozeCount: number;
  blockedAttemptCount: number;
  idleMinutes: number;
  breakMinutes?: number;
  bestScheduleTitle: string | null;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  schemaVersion: number;
  onboardingCompleted: boolean;
  mainUI: MainUI;
  defaultBlockingMode: BlockingMode;
  idleThresholdMinutes: 3 | 5 | 10;
  notificationsEnabled: boolean;
  distractionWarningsEnabled: boolean;
  activityHeartbeatEnabled: boolean;
  dailyReportEnabled: boolean;
  defaultBlockedDomains: DomainRule[];
}

export interface TemporaryAllow {
  hostname: string;
  sessionId: string;
  reason: string;
  expiresAt: string | null;
}

export type NotificationKind =
  | "schedule-start"
  | "schedule-overdue"
  | "snooze-warning"
  | "focus-check"
  | "distraction-detected"
  | "idle-check"
  | "break-end"
  | "focus-end"
  | "finish-confirm"
  | "tab-organize-confirm"
  | "next-schedule"
  | "report-ready";

export interface NotificationRecord {
  id: string;
  sentAt: string;
  handled: boolean;
  title?: string;
  message: string;
}

export type NotificationState = Record<string, NotificationRecord>;

export type FocusState =
  | { type: "idle" }
  | { type: "scheduled"; scheduleId: string }
  | { type: "snoozed"; scheduleId: string; until: string }
  | { type: "focusing"; scheduleId: string; sessionId: string }
  | { type: "paused"; scheduleId: string; sessionId: string }
  | { type: "awaiting-result"; scheduleId: string; sessionId: string }
  | { type: "completed"; scheduleId: string; sessionId: string };

export type FocusHealth = "healthy" | "needs-check" | "distracted" | "away";

export type TabCategory = "work" | "reference" | "communication" | "break" | "unclassified";

export interface TabOrganizerSettings {
  enabled: boolean;
  organizeOnFocusStart: boolean;
  organizeOnFocusResume: boolean;
  classifyNewTabsDuringFocus: boolean;
  rememberBreakOpenedTabs: boolean;
  collapseBreakGroupOnFocus: boolean;
  expandBreakGroupOnBreak: boolean;
  activateWorkTabAfterOrganize: boolean;
  activateLastBreakTabOnBreak: boolean;
  restoreLayoutOnFinish: "ask" | "always" | "never";
  preserveUserGroups: boolean;
  includePinnedTabs: boolean;
  rememberCorrections: boolean;
}

export interface TabOrganizerSummary {
  lastOrganizedAt?: string;
  lastSnapshotId?: string;
  counts: Record<TabCategory, number>;
}

export interface AppSnapshot {
  schedules: Schedule[];
  activeSession: FocusSession | null;
  reports: DailyReport[];
  settings: UserSettings;
  notificationState: NotificationState;
  temporaryAllows: TemporaryAllow[];
  tabOrganizerSettings: TabOrganizerSettings;
  tabOrganizerSummary: TabOrganizerSummary;
  membership: import("../../features/membership/types").MembershipSnapshot;
  cloudSync: import("../../features/cloud-sync/types").CloudSyncSnapshot;
}
