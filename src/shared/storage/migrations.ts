import { CURRENT_SCHEMA_VERSION, DEFAULT_SETTINGS } from "../constants";
import type { UserSettings } from "../types/models";

export interface MigrationInput {
  schemaVersion?: unknown;
  settings?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDomainRule(value: unknown): value is UserSettings["defaultBlockedDomains"][number] {
  return isRecord(value) && typeof value.hostname === "string" && typeof value.includeSubdomains === "boolean";
}

export function migrateSettings(input: MigrationInput): UserSettings {
  const raw = isRecord(input.settings) ? input.settings : {};
  const mainUI = raw.mainUI === "popup" ? "popup" : "sidepanel";
  const defaultBlockingMode = raw.defaultBlockingMode === "blocklist" || raw.defaultBlockingMode === "off"
    ? raw.defaultBlockingMode
    : "allowlist";
  const idleThresholdMinutes = raw.idleThresholdMinutes === 3 || raw.idleThresholdMinutes === 10 ? raw.idleThresholdMinutes : 5;
  return {
    ...DEFAULT_SETTINGS,
    onboardingCompleted: typeof raw.onboardingCompleted === "boolean" ? raw.onboardingCompleted : false,
    mainUI,
    defaultBlockingMode,
    idleThresholdMinutes,
    notificationsEnabled: typeof raw.notificationsEnabled === "boolean" ? raw.notificationsEnabled : true,
    distractionWarningsEnabled: typeof raw.distractionWarningsEnabled === "boolean" ? raw.distractionWarningsEnabled : true,
    activityHeartbeatEnabled: typeof raw.activityHeartbeatEnabled === "boolean" ? raw.activityHeartbeatEnabled : true,
    dailyReportEnabled: typeof raw.dailyReportEnabled === "boolean" ? raw.dailyReportEnabled : true,
    defaultBlockedDomains: Array.isArray(raw.defaultBlockedDomains) ? raw.defaultBlockedDomains.filter(isDomainRule) : [],
    schemaVersion: CURRENT_SCHEMA_VERSION
  };
}
