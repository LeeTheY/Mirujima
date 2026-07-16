import type { AppSnapshot, MainUI, Schedule, TabCategory, TabOrganizerSettings } from "./models";

export type ExtensionMessage =
  | { type: "APP_BOOTSTRAP" }
  | { type: "SCHEDULE_CREATE"; payload: Schedule }
  | { type: "SCHEDULE_UPDATE"; payload: Schedule }
  | { type: "SCHEDULE_DELETE"; scheduleId: string }
  | { type: "SCHEDULE_SNOOZE"; scheduleId: string; minutes: number }
  | { type: "FOCUS_START"; scheduleId: string; organizeTabs?: boolean }
  | { type: "FOCUS_PAUSE" }
  | { type: "FOCUS_RESUME" }
  | { type: "FOCUS_BREAK" }
  | { type: "FOCUS_FINISH"; result: "completed" | "incomplete" }
  | { type: "ACTIVITY_HEARTBEAT"; occurredAt: string; visible: boolean }
  | { type: "BLOCKED_ATTEMPT"; hostname: string }
  | { type: "TEMPORARY_ALLOW"; hostname: string; minutes: number; reason: string }
  | { type: "IDLE_ACTION"; action: "continue" | "break" | "pause" }
  | { type: "OPEN_MAIN_UI"; target?: MainUI }
  | { type: "GENERATE_DAILY_REPORT"; dateKey: string }
  | { type: "SETTINGS_UPDATE"; payload: AppSnapshot["settings"] }
  | { type: "NOTIFICATION_TEST" }
  | { type: "NOTIFICATION_HANDLE"; notificationId: string }
  | { type: "EXPORT_DATA" }
  | { type: "CLEAR_DATA" }
  | { type: "TAB_ORGANIZE"; mode: "smart" | "full" }
  | { type: "TAB_LAYOUT_RESTORE"; sessionId: string }
  | { type: "TAB_CLASSIFICATION_UPDATE"; tabId: number; category: TabCategory; remember: "once" | "schedule" | "global" }
  | { type: "WORK_TAB_SET_SAVE"; scheduleId?: string; name: string }
  | { type: "TAB_ORGANIZER_SETTINGS_UPDATE"; payload: TabOrganizerSettings }
  | { type: "MEMBERSHIP_CHECK_ACCOUNT" }
  | { type: "MEMBERSHIP_SIGN_IN" }
  | { type: "MEMBERSHIP_ACTIVATE" }
  | { type: "MEMBERSHIP_RESTORE" }
  | { type: "MEMBERSHIP_SIGN_OUT" }
  | { type: "CLOUD_INITIAL_BACKUP" }
  | { type: "CLOUD_RESTORE_PREVIEW" }
  | { type: "CLOUD_RESTORE_CONFIRM" }
  | { type: "CLOUD_SYNC_NOW" }
  | { type: "CLOUD_CONFLICT_RESOLVE"; entityType: import("../../features/cloud-sync/types").CloudEntityType; entityId: string; resolution: "local" | "cloud" }
  | { type: "AI_SCREEN_SELECT" }
  | { type: "AI_BEGIN_SELECTION" }
  | { type: "AI_APPLY_TEXT"; tabId: number; text: string };

export type MessageResponse<T = AppSnapshot> =
  | { ok: true; data: T }
  | { ok: false; error: string };
