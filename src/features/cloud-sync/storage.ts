import { STORAGE_KEYS } from "../../shared/constants";
import { createId } from "../../shared/utils/id";
import { getMembershipCache, getOrCreateDeviceId } from "../membership/storage";
import { hasPremiumEntitlement } from "../membership/types";
import type { LearningDay } from "../learning-grass/learning";
import { learningDayFromReport } from "../learning-grass/learning";
import type { DailyReport, FocusSession, Schedule, UserSettings } from "../../shared/types/models";
import { dateKeyDaysAgo } from "../../shared/time/time";
import { EMPTY_CLOUD_SYNC_STATE, type CloudEntityType, type CloudRecord, type CloudRecordMetadata, type CloudSyncSnapshot, type CloudSyncState, type PendingCloudMutation } from "./types";

let queueSuppressionDepth = 0;

function area(): chrome.storage.StorageArea {
  return chrome.storage.local;
}

async function read<T>(key: string, fallback: T): Promise<T> {
  const values = await area().get(key);
  return values[key] === undefined ? fallback : values[key] as T;
}

async function write<T>(key: string, value: T): Promise<void> {
  await area().set({ [key]: value });
}

function metadataKey(entityType: CloudEntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

async function canQueue(feature: "cloud-sync" | "learning-grass" = "cloud-sync"): Promise<boolean> {
  if (queueSuppressionDepth > 0) return false;
  return hasPremiumEntitlement(await getMembershipCache(), feature);
}

export async function runWithoutCloudQueue<T>(operation: () => Promise<T>): Promise<T> {
  queueSuppressionDepth += 1;
  try { return await operation(); } finally { queueSuppressionDepth -= 1; }
}

export const cloudSyncStorage = {
  getPending: () => read<PendingCloudMutation[]>(STORAGE_KEYS.cloudPendingMutations, []),
  setPending: (value: PendingCloudMutation[]) => write(STORAGE_KEYS.cloudPendingMutations, value),
  getMetadata: () => read<Record<string, CloudRecordMetadata>>(STORAGE_KEYS.cloudRecordMetadata, {}),
  setMetadata: (value: Record<string, CloudRecordMetadata>) => write(STORAGE_KEYS.cloudRecordMetadata, value),
  getState: () => read<CloudSyncState>(STORAGE_KEYS.cloudSyncState, EMPTY_CLOUD_SYNC_STATE),
  setState: (value: CloudSyncState) => write(STORAGE_KEYS.cloudSyncState, value),
  getLearningDays: () => read<LearningDay[]>(STORAGE_KEYS.cloudLearningDays, []),
  setLearningDays: (value: LearningDay[]) => {
    const cutoff = dateKeyDaysAgo(364);
    return write(STORAGE_KEYS.cloudLearningDays, value.filter((item) => item.dateKey >= cutoff));
  },
  getRestoreRecords: () => read<CloudRecord[]>(STORAGE_KEYS.cloudRestoreRecords, []),
  setRestoreRecords: (value: CloudRecord[]) => write(STORAGE_KEYS.cloudRestoreRecords, value),

  async clearAccountCache(): Promise<void> {
    await area().remove([
      STORAGE_KEYS.cloudPendingMutations,
      STORAGE_KEYS.cloudRecordMetadata,
      STORAGE_KEYS.cloudSyncState,
      STORAGE_KEYS.cloudLearningDays,
      STORAGE_KEYS.cloudRestoreRecords
    ]);
  },

  async getSnapshot(): Promise<CloudSyncSnapshot> {
    const [state, pending, learningDays] = await Promise.all([this.getState(), this.getPending(), this.getLearningDays()]);
    return { state: { ...EMPTY_CLOUD_SYNC_STATE, ...state, pendingCount: pending.length }, learningDays };
  },

  async enqueue(entityType: CloudEntityType, entityId: string, payload: Record<string, unknown> | null, operation: "upsert" | "delete" = "upsert"): Promise<void> {
    if (!(await canQueue(entityType === "learning-day" ? "learning-grass" : "cloud-sync"))) return;
    const [pending, metadata, deviceId] = await Promise.all([this.getPending(), this.getMetadata(), getOrCreateDeviceId()]);
    const key = metadataKey(entityType, entityId);
    const existing = pending.find((item) => item.entityType === entityType && item.entityId === entityId);
    const mutation: PendingCloudMutation = existing ? {
      ...existing, operation, payload, createdAt: new Date().toISOString()
    } : {
      mutationId: crypto.randomUUID(), entityType, entityId, operation, payload,
      expectedVersion: metadata[key]?.version ?? 0,
      deviceId, createdAt: new Date().toISOString(), attempts: 0
    };
    await this.setPending([...pending.filter((item) => item.mutationId !== mutation.mutationId), mutation]);
  },

  async queueScheduleChanges(previous: Schedule[], next: Schedule[]): Promise<void> {
    const oldMap = new Map(previous.map((item) => [item.id, item]));
    const nextMap = new Map(next.map((item) => [item.id, item]));
    for (const schedule of next) {
      if (JSON.stringify(oldMap.get(schedule.id)) !== JSON.stringify(schedule)) await this.enqueue("schedule", schedule.id, { ...schedule });
    }
    for (const schedule of previous) {
      if (!nextMap.has(schedule.id)) await this.enqueue("schedule", schedule.id, { ...schedule }, "delete");
    }
  },

  async queueSettings(settings: UserSettings): Promise<void> {
    await this.enqueue("settings", "settings", { ...settings });
  },

  async queueSessionChanges(previous: FocusSession[], next: FocusSession[]): Promise<void> {
    const oldMap = new Map(previous.map((item) => [item.id, item]));
    for (const session of next) {
      if (session.status === "completed" && JSON.stringify(oldMap.get(session.id)) !== JSON.stringify(session)) {
        await this.enqueue("focus-session", session.id, { ...session });
      }
    }
  },

  async queueReportChanges(previous: DailyReport[], next: DailyReport[]): Promise<void> {
    if (!(await canQueue("cloud-sync"))) return;
    const oldMap = new Map(previous.map((item) => [item.id, item]));
    const learningDays = await this.getLearningDays();
    let nextLearningDays = [...learningDays];
    const learningEnabled = await canQueue("learning-grass");
    for (const report of next) {
      if (JSON.stringify(oldMap.get(report.id)) !== JSON.stringify(report)) {
        await this.enqueue("report", report.id, { ...report });
        if (learningEnabled) {
          const learningDay = learningDayFromReport(report);
          nextLearningDays = [...nextLearningDays.filter((item) => item.dateKey !== learningDay.dateKey), learningDay];
          await this.enqueue("learning-day", learningDay.dateKey, { ...learningDay });
        }
      }
    }
    if (learningEnabled && JSON.stringify(nextLearningDays) !== JSON.stringify(learningDays)) {
      await this.setLearningDays(nextLearningDays.sort((a, b) => a.dateKey.localeCompare(b.dateKey)));
    }
  },

  async setAppliedMetadata(record: CloudRecord): Promise<void> {
    const metadata = await this.getMetadata();
    metadata[metadataKey(record.entityType, record.entityId)] = { version: record.version, updatedAt: record.updatedAt };
    await this.setMetadata(metadata);
  },

  metadataKey
};

export function recordPayload(value: object): Record<string, unknown> {
  return { ...value } as Record<string, unknown>;
}

export function createLocalEntityId(prefix: string): string {
  return createId(prefix);
}
