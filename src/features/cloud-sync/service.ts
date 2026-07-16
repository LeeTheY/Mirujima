import type { DailyReport, FocusSession, Schedule } from "../../shared/types/models";
import { repository } from "../../shared/storage/repository";
import { migrateSettings } from "../../shared/storage/migrations";
import { membershipDevicePayload, membershipSupabaseClient } from "../membership/service";
import { getMembershipCache } from "../membership/storage";
import { hasPremiumEntitlement } from "../membership/types";
import { learningDayFromReport, type LearningDay } from "../learning-grass/learning";
import { cloudSyncStorage, runWithoutCloudQueue } from "./storage";
import { EMPTY_CLOUD_SYNC_STATE, type CloudEntityType, type CloudRecord, type CloudRestorePreview, type CloudSyncState } from "./types";

interface PushResult {
  mutationId: string;
  status: "applied" | "conflict";
  record: CloudRecord;
}

interface CloudFunctionResponse {
  records?: CloudRecord[];
  results?: PushResult[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSchedule(value: Record<string, unknown> | null): value is Record<string, unknown> & Schedule {
  if (!value) return false;
  return typeof value.id === "string" && typeof value.title === "string" && typeof value.startAt === "string" && typeof value.endAt === "string";
}

function isFocusSession(value: Record<string, unknown> | null): value is Record<string, unknown> & FocusSession {
  if (!value) return false;
  return typeof value.id === "string" && typeof value.scheduleId === "string" && typeof value.dateKey === "string" && typeof value.status === "string";
}

function isDailyReport(value: Record<string, unknown> | null): value is Record<string, unknown> & DailyReport {
  if (!value) return false;
  return typeof value.id === "string" && typeof value.dateKey === "string" && typeof value.actualFocusMinutes === "number";
}

function isLearningDay(value: Record<string, unknown> | null): value is Record<string, unknown> & LearningDay {
  if (!value) return false;
  return typeof value.dateKey === "string" && typeof value.learningScore === "number" && typeof value.intensity === "number";
}

async function requireCloudSync(): Promise<void> {
  if (!hasPremiumEntitlement(await getMembershipCache(), "cloud-sync")) {
    throw new Error("Premium cloud-sync 권한을 확인할 수 없습니다.");
  }
}

async function updateState(patch: Partial<CloudSyncState>): Promise<CloudSyncState> {
  const pending = await cloudSyncStorage.getPending();
  const next = { ...EMPTY_CLOUD_SYNC_STATE, ...await cloudSyncStorage.getState(), ...patch, pendingCount: pending.length };
  await cloudSyncStorage.setState(next);
  return next;
}

async function invokeCloud(body: Record<string, unknown>): Promise<CloudFunctionResponse> {
  const { data, error } = await membershipSupabaseClient().functions.invoke<CloudFunctionResponse>("cloud-sync", {
    body: { ...body, ...await membershipDevicePayload() }
  });
  if (error) throw new Error(error.message || "클라우드 동기화 요청이 실패했습니다.");
  if (!data) throw new Error("클라우드 동기화 서버가 빈 응답을 반환했습니다.");
  return data;
}

function previewCounts(records: CloudRecord[]): CloudRestorePreview {
  return {
    schedules: records.filter((item) => item.entityType === "schedule" && !item.deletedAt).length,
    settings: records.filter((item) => item.entityType === "settings" && !item.deletedAt).length,
    focusSessions: records.filter((item) => item.entityType === "focus-session" && !item.deletedAt).length,
    reports: records.filter((item) => item.entityType === "report" && !item.deletedAt).length,
    learningDays: records.filter((item) => item.entityType === "learning-day" && !item.deletedAt).length,
    deleted: records.filter((item) => Boolean(item.deletedAt)).length
  };
}

async function pullRecords(): Promise<CloudRecord[]> {
  const response = await invokeCloud({ action: "pull" });
  return Array.isArray(response.records) ? response.records : [];
}

async function applyRecords(records: CloudRecord[]): Promise<void> {
  await runWithoutCloudQueue(async () => {
    let schedules = await repository.getSchedules();
    let sessions = await repository.getSessionHistory();
    let reports = await repository.getReports();
    let settings = await repository.getSettings();
    let learningDays = await cloudSyncStorage.getLearningDays();

    for (const record of records) {
      if (record.entityType === "schedule") {
        schedules = schedules.filter((item) => item.id !== record.entityId);
        if (!record.deletedAt && isSchedule(record.payload)) schedules.push(record.payload);
      } else if (record.entityType === "focus-session") {
        sessions = sessions.filter((item) => item.id !== record.entityId);
        if (!record.deletedAt && isFocusSession(record.payload)) sessions.push(record.payload);
      } else if (record.entityType === "report") {
        reports = reports.filter((item) => item.id !== record.entityId);
        if (!record.deletedAt && isDailyReport(record.payload)) reports.push(record.payload);
      } else if (record.entityType === "settings" && !record.deletedAt && isObject(record.payload)) {
        const migrated = migrateSettings({ schemaVersion: record.payload.schemaVersion, settings: record.payload });
        settings = { ...migrated, onboardingCompleted: settings.onboardingCompleted || migrated.onboardingCompleted };
      } else if (record.entityType === "learning-day") {
        learningDays = learningDays.filter((item) => item.dateKey !== record.entityId);
        if (!record.deletedAt && isLearningDay(record.payload)) learningDays.push(record.payload);
      }
      await cloudSyncStorage.setAppliedMetadata(record);
    }

    await repository.setSchedules(schedules.sort((a, b) => a.startAt.localeCompare(b.startAt)));
    await repository.setSessionHistory(sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt)));
    await repository.setReports(reports.sort((a, b) => b.dateKey.localeCompare(a.dateKey)));
    await repository.setSettings(settings);
    await cloudSyncStorage.setLearningDays(learningDays.sort((a, b) => a.dateKey.localeCompare(b.dateKey)));
  });
}

async function pushPending(): Promise<void> {
  const pending = await cloudSyncStorage.getPending();
  if (!pending.length) return;
  const response = await invokeCloud({ action: "push", mutations: pending.slice(0, 100) });
  const results = Array.isArray(response.results) ? response.results : [];
  const processed = new Set(results.map((item) => item.mutationId));
  const state = await cloudSyncStorage.getState();
  const conflicts = [...state.conflicts];
  for (const result of results) {
    const mutation = pending.find((item) => item.mutationId === result.mutationId);
    if (!mutation) continue;
    if (result.status === "applied") {
      await cloudSyncStorage.setAppliedMetadata(result.record);
    } else {
      conflicts.push({
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        localPayload: mutation.payload,
        cloudRecord: result.record,
        detectedAt: new Date().toISOString()
      });
    }
  }
  await cloudSyncStorage.setPending(pending.filter((item) => !processed.has(item.mutationId)));
  await updateState({ conflicts, status: conflicts.length ? "conflict" : "syncing" });
  if (pending.length > 100) await pushPending();
}

async function queueCurrentSnapshot(): Promise<void> {
  const [schedules, settings, sessions, reports, storedLearningDays] = await Promise.all([
    repository.getSchedules(), repository.getSettings(), repository.getSessionHistory(), repository.getReports(), cloudSyncStorage.getLearningDays()
  ]);
  const learningEnabled = hasPremiumEntitlement(await getMembershipCache(), "learning-grass");
  const learningDays = learningEnabled ? reports.reduce<LearningDay[]>((days, report) => {
    const day = learningDayFromReport(report);
    return [...days.filter((item) => item.dateKey !== day.dateKey), day];
  }, storedLearningDays) : [];
  if (learningEnabled) await cloudSyncStorage.setLearningDays(learningDays.sort((a, b) => a.dateKey.localeCompare(b.dateKey)));
  for (const schedule of schedules) await cloudSyncStorage.enqueue("schedule", schedule.id, { ...schedule });
  await cloudSyncStorage.enqueue("settings", "settings", { ...settings });
  for (const session of sessions.filter((item) => item.status === "completed")) await cloudSyncStorage.enqueue("focus-session", session.id, { ...session });
  for (const report of reports) await cloudSyncStorage.enqueue("report", report.id, { ...report });
  if (learningEnabled) for (const day of learningDays) await cloudSyncStorage.enqueue("learning-day", day.dateKey, { ...day });
}

async function localPayload(entityType: CloudEntityType, entityId: string): Promise<Record<string, unknown> | null> {
  if (entityType === "schedule") return (await repository.getSchedules()).find((item) => item.id === entityId) as unknown as Record<string, unknown> ?? null;
  if (entityType === "focus-session") return (await repository.getSessionHistory()).find((item) => item.id === entityId) as unknown as Record<string, unknown> ?? null;
  if (entityType === "report") return (await repository.getReports()).find((item) => item.id === entityId) as unknown as Record<string, unknown> ?? null;
  if (entityType === "settings") return { ...await repository.getSettings() };
  return (await cloudSyncStorage.getLearningDays()).find((item) => item.dateKey === entityId) as unknown as Record<string, unknown> ?? null;
}

export const cloudSyncService = {
  async initialBackup(): Promise<void> {
    await requireCloudSync();
    await updateState({ status: "syncing", error: null });
    try {
      await queueCurrentSnapshot();
      await pushPending();
      const state = await cloudSyncStorage.getState();
      await updateState({ initialized: state.conflicts.length === 0, status: state.conflicts.length ? "conflict" : "idle", lastSyncAt: new Date().toISOString() });
    } catch (cause) {
      await updateState({ status: "offline", error: cause instanceof Error ? cause.message : "초기 백업에 실패했습니다." });
      throw cause;
    }
  },

  async previewRestore(): Promise<void> {
    await requireCloudSync();
    await updateState({ status: "syncing", error: null });
    try {
      const records = await pullRecords();
      await cloudSyncStorage.setRestoreRecords(records);
      await updateState({ status: "idle", restorePreview: previewCounts(records) });
    } catch (cause) {
      await updateState({ status: "offline", error: cause instanceof Error ? cause.message : "복원 정보를 불러오지 못했습니다." });
      throw cause;
    }
  },

  async confirmRestore(): Promise<void> {
    await requireCloudSync();
    const records = await cloudSyncStorage.getRestoreRecords();
    if (!(await cloudSyncStorage.getState()).restorePreview) throw new Error("먼저 클라우드 복원 내용을 확인해 주세요.");
    await updateState({ status: "syncing", error: null });
    const before = {
      schedules: await repository.getSchedules(), sessions: await repository.getSessionHistory(), reports: await repository.getReports(),
      learningDays: await cloudSyncStorage.getLearningDays()
    };
    const remoteKeys = new Set(records.map((item) => `${item.entityType}:${item.entityId}`));
    await applyRecords(records);
    for (const item of before.schedules.filter((value) => !remoteKeys.has(`schedule:${value.id}`))) await cloudSyncStorage.enqueue("schedule", item.id, { ...item });
    for (const item of before.sessions.filter((value) => !remoteKeys.has(`focus-session:${value.id}`))) await cloudSyncStorage.enqueue("focus-session", item.id, { ...item });
    for (const item of before.reports.filter((value) => !remoteKeys.has(`report:${value.id}`))) await cloudSyncStorage.enqueue("report", item.id, { ...item });
    for (const item of before.learningDays.filter((value) => !remoteKeys.has(`learning-day:${value.dateKey}`))) await cloudSyncStorage.enqueue("learning-day", item.dateKey, { ...item });
    await pushPending();
    await cloudSyncStorage.setRestoreRecords([]);
    const state = await cloudSyncStorage.getState();
    await updateState({ initialized: true, restorePreview: null, status: state.conflicts.length ? "conflict" : "idle", lastSyncAt: new Date().toISOString() });
  },

  async sync(): Promise<void> {
    await requireCloudSync();
    const current = await cloudSyncStorage.getState();
    if (!current.initialized) return;
    await updateState({ status: "syncing", error: null });
    try {
      await pushPending();
      const stateAfterPush = await cloudSyncStorage.getState();
      if (!stateAfterPush.conflicts.length) await applyRecords(await pullRecords());
      await updateState({ status: stateAfterPush.conflicts.length ? "conflict" : "idle", lastSyncAt: new Date().toISOString(), error: null });
    } catch (cause) {
      await updateState({ status: "offline", error: cause instanceof Error ? cause.message : "동기화하지 못했습니다." });
      throw cause;
    }
  },

  async resolveConflict(entityType: CloudEntityType, entityId: string, resolution: "local" | "cloud"): Promise<void> {
    const state = await cloudSyncStorage.getState();
    const conflict = state.conflicts.find((item) => item.entityType === entityType && item.entityId === entityId);
    if (!conflict) throw new Error("해결할 충돌을 찾지 못했습니다.");
    if (resolution === "cloud") {
      await applyRecords([conflict.cloudRecord]);
    } else {
      await cloudSyncStorage.setAppliedMetadata(conflict.cloudRecord);
      const payload = await localPayload(entityType, entityId) ?? conflict.localPayload;
      await cloudSyncStorage.enqueue(entityType, entityId, payload, payload ? "upsert" : "delete");
    }
    const remaining = state.conflicts.filter((item) => item !== conflict);
    await updateState({ conflicts: remaining, status: remaining.length ? "conflict" : "idle" });
    if (resolution === "local") await pushPending();
  }
};
