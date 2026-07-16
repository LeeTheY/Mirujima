import type { LearningDay } from "../learning-grass/learning";

export type CloudEntityType = "schedule" | "settings" | "focus-session" | "report" | "learning-day";
export type CloudMutationOperation = "upsert" | "delete";

export interface PendingCloudMutation {
  mutationId: string;
  entityType: CloudEntityType;
  entityId: string;
  operation: CloudMutationOperation;
  expectedVersion: number;
  payload: Record<string, unknown> | null;
  deviceId: string;
  createdAt: string;
  attempts: number;
}

export interface CloudRecord {
  entityType: CloudEntityType;
  entityId: string;
  payload: Record<string, unknown> | null;
  version: number;
  deviceId: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CloudRecordMetadata {
  version: number;
  updatedAt: string;
}

export interface CloudConflict {
  entityType: CloudEntityType;
  entityId: string;
  localPayload: Record<string, unknown> | null;
  cloudRecord: CloudRecord;
  detectedAt: string;
}

export interface CloudRestorePreview {
  schedules: number;
  settings: number;
  focusSessions: number;
  reports: number;
  learningDays: number;
  deleted: number;
}

export interface CloudSyncState {
  status: "idle" | "syncing" | "offline" | "conflict";
  initialized: boolean;
  lastSyncAt: string | null;
  pendingCount: number;
  conflicts: CloudConflict[];
  restorePreview: CloudRestorePreview | null;
  error: string | null;
}

export interface CloudSyncSnapshot {
  state: CloudSyncState;
  learningDays: LearningDay[];
}

export const EMPTY_CLOUD_SYNC_STATE: CloudSyncState = {
  status: "idle",
  initialized: false,
  lastSyncAt: null,
  pendingCount: 0,
  conflicts: [],
  restorePreview: null,
  error: null
};
