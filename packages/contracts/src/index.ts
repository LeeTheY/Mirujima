import { z } from "zod";

export const userRoleSchema = z.enum(["student", "guardian"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const guardianSharingPreferencesSchema = z.object({
  shareCompletion: z.boolean(),
  shareTotalFocusMinutes: z.boolean(),
  shareRewardStatus: z.boolean(),
  shareAiSummary: z.boolean()
});
export type GuardianSharingPreferences = z.infer<typeof guardianSharingPreferencesSchema>;

export const DEFAULT_GUARDIAN_SHARING_PREFERENCES: GuardianSharingPreferences = {
  shareCompletion: true,
  shareTotalFocusMinutes: true,
  shareRewardStatus: true,
  shareAiSummary: false
};

export function normalizeHostname(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) throw new Error("도메인을 입력해 주세요.");
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let hostname: string;
  try {
    hostname = new URL(candidate).hostname.toLowerCase();
  } catch {
    throw new Error("올바른 도메인 형식이 아닙니다.");
  }
  hostname = hostname.replace(/^www\./, "").replace(/\.$/, "");
  if (!hostname || hostname.includes(" ") || (!hostname.includes(".") && hostname !== "localhost")) {
    throw new Error("올바른 도메인 형식이 아닙니다.");
  }
  return hostname;
}

const hostnameSchema = z.string().transform((value, context) => {
  try {
    return normalizeHostname(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "올바른 도메인 형식이 아닙니다."
    });
    return z.NEVER;
  }
});

export const domainRuleSchema = z.object({
  hostname: hostnameSchema,
  includeSubdomains: z.boolean()
});
export type DomainRule = z.infer<typeof domainRuleSchema>;

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const focusGoalSchema = z.object({
  id: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(120),
  detail: z.string().trim().max(1_000),
  minutes: z.number().int().min(1).max(720),
  priority: z.enum(["low", "medium", "high"])
});
export type FocusGoal = z.infer<typeof focusGoalSchema>;

export const aiCoachingTaskSchema = z.enum([
  "focus-plan-review",
  "study-recommendation",
  "guardian-summary",
  "weekly-report",
]);
export type AiCoachingTask = z.infer<typeof aiCoachingTaskSchema>;

const aiTextSchema = z.string().trim().min(1).max(1_000);
const aiSuggestionListSchema = z.array(aiTextSchema).min(1).max(6);

export const focusCoachRequestSchema = z.object({
  action: z.literal("focus-coach"),
  title: z.string().trim().min(1).max(120),
  targetFocusMinutes: z.number().int().min(1).max(720),
  goals: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    detail: z.string().trim().max(500),
    minutes: z.number().int().min(1).max(720),
  }).strict()).min(1).max(10),
}).strict();
export type FocusCoachRequest = z.infer<typeof focusCoachRequestSchema>;

export const focusCoachResultSchema = z.object({
  task: z.literal("focus-plan-review"),
  summary: aiTextSchema,
  recommendedTitle: z.string().trim().min(1).max(120),
  recommendedFocusMinutes: z.number().int().min(1).max(720),
  recommendedBreakMinutes: z.number().int().min(0).max(120),
  steps: aiSuggestionListSchema,
  reason: aiTextSchema,
}).strict();
export type FocusCoachResult = z.infer<typeof focusCoachResultSchema>;

export const studyRecommendationResultSchema = z.object({
  task: z.literal("study-recommendation"),
  title: z.string().trim().min(1).max(120),
  summary: aiTextSchema,
  recommendedOrder: z.array(z.object({
    subject: z.string().trim().min(1).max(120),
    focusMinutes: z.number().int().min(5).max(180),
    reason: aiTextSchema,
  }).strict()).min(1).max(5),
  nextAction: aiTextSchema,
}).strict();
export type StudyRecommendationResult = z.infer<typeof studyRecommendationResultSchema>;

export const guardianSummaryResultSchema = z.object({
  consentRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  task: z.literal("guardian-summary"),
  title: z.string().trim().min(1).max(120),
  summary: aiTextSchema,
  suggestions: z.array(aiTextSchema).min(1).max(4),
}).strict();
export type GuardianSummaryResult = z.infer<typeof guardianSummaryResultSchema>;

export const weeklyReportResultSchema = z.object({
  task: z.literal("weekly-report"),
  title: z.string().trim().min(1).max(120),
  achievementSummary: aiTextSchema,
  wins: z.array(aiTextSchema).min(1).max(4),
  improvements: z.array(aiTextSchema).min(1).max(4),
  nextWeekPlan: z.array(aiTextSchema).min(1).max(4),
}).strict();
export type WeeklyReportResult = z.infer<typeof weeklyReportResultSchema>;

export const aiCoachingRequestSchema = z.discriminatedUnion("action", [
  focusCoachRequestSchema,
  z.object({ action: z.literal("study-recommendation") }).strict(),
  z.object({ action: z.literal("guardian-summary") }).strict(),
  z.object({ action: z.literal("weekly-report") }).strict(),
]);

export const aiCoachingResultSchema = z.discriminatedUnion("task", [
  focusCoachResultSchema,
  studyRecommendationResultSchema,
  guardianSummaryResultSchema,
  weeklyReportResultSchema,
]);
export type AiCoachingResult = z.infer<typeof aiCoachingResultSchema>;

export const focusGoalsSchema = z.array(focusGoalSchema).min(1).max(100).superRefine((goals, context) => {
  const seen = new Set<string>();
  goals.forEach((goal, index) => {
    if (seen.has(goal.id)) {
      context.addIssue({ code: "custom", path: [index, "id"], message: "목표 ID는 중복될 수 없습니다." });
    }
    seen.add(goal.id);
  });
});

export const focusPlanSchema = z.object({
  id: z.string().trim().min(1).max(300),
  ownerUserId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plannedStartAt: isoDateTimeSchema.nullable(),
  targetFocusMinutes: z.number().int().min(1).max(720),
  activityMode: z.enum(["interactive", "reading", "watching", "offline"]),
  blockingMode: z.enum(["allowlist", "blocklist", "off"]),
  allowedDomains: z.array(domainRuleSchema).max(200),
  blockedDomains: z.array(domainRuleSchema).max(200),
  breakMinutes: z.number().int().min(1).max(120),
  priority: z.enum(["low", "medium", "high"]),
  selfDepositPoints: z.number().int().min(0).max(1_000_000_000),
  guardianRewardRequestPoints: z.number().int().min(0).max(1_000_000_000),
  goals: focusGoalsSchema,
  status: z.enum(["draft", "planned", "ready", "active", "completed", "failed", "cancelled"]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});
export type FocusPlan = z.infer<typeof focusPlanSchema>;

export function normalizeFocusPlan(value: unknown): FocusPlan {
  return focusPlanSchema.parse(value);
}

export const focusSettlementResultSchema = z.object({
  completedGoalIds: z.array(z.string().trim().min(1).max(128)).max(100),
  goalResults: z.array(z.object({
    goalId: z.string().trim().min(1).max(128),
    completed: z.boolean()
  })).max(100),
  completedGoalCount: z.number().int().min(0).max(100),
  totalGoalCount: z.number().int().min(1).max(100),
  completionPercent: z.union([z.literal(0), z.literal(60), z.literal(80), z.literal(100)]),
  earnedPoints: z.number().int().min(0).max(1_000_000_000),
  returnedPoints: z.number().int().min(0).max(1_000_000_000),
  settledAt: isoDateTimeSchema
});
export type FocusSettlementResult = z.infer<typeof focusSettlementResultSchema>;

const canonicalFocusSessionBaseSchema = z.object({
  id: z.string().trim().min(1).max(300),
  scheduleId: z.string().trim().min(1).max(300),
  ownerUserId: z.string().uuid(),
  startedAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  targetFocusMinutes: z.number().int().min(1).max(720),
  blockingMode: z.enum(["allowlist", "blocklist", "off"]),
  goals: focusGoalsSchema.optional().default([]),
  status: z.enum(["starting", "active", "paused", "awaiting-result", "success", "failed", "cancelled"]),
  enforcementDeadlineAt: isoDateTimeSchema.nullable().optional(),
  activeSegmentStartedAt: isoDateTimeSchema.nullable().optional(),
  pausedAt: isoDateTimeSchema.nullable().optional(),
  pauseKind: z.enum(["manual", "break"]).nullable().optional(),
  breakStartedAt: isoDateTimeSchema.nullable().optional(),
  breakEndsAt: isoDateTimeSchema.nullable().optional(),
  accumulatedBreakSeconds: z.number().int().min(0).max(7200).optional(),
  accumulatedFocusSeconds: z.number().int().min(0).max(720 * 60).optional(),
  remainingFocusSeconds: z.number().int().min(0).max(720 * 60).optional(),
  depositPolicy: z.discriminatedUnion("version", [
    z.object({ version: z.literal(1), mode: z.literal("tiered") }),
    z.object({ version: z.literal(2), mode: z.literal("all-or-none") }),
  ]).optional(),
  selfDepositPoints: z.number().int().min(0).max(1_000_000_000).optional(),
  result: focusSettlementResultSchema.nullable().optional(),
  updatedAt: isoDateTimeSchema.optional()
});

export const canonicalFocusSessionSchema = canonicalFocusSessionBaseSchema.transform((session) => {
  const targetSeconds = session.targetFocusMinutes * 60;
  const accumulatedFocusSeconds = Math.min(targetSeconds, session.accumulatedFocusSeconds ?? 0);
  const terminal = session.status === "success" || session.status === "failed" || session.status === "cancelled";
  const remainingFocusSeconds = terminal || session.status === "awaiting-result"
    ? 0
    : Math.min(targetSeconds, session.remainingFocusSeconds ?? Math.max(0, targetSeconds - accumulatedFocusSeconds));
  const activeSegmentStartedAt = session.activeSegmentStartedAt !== undefined
    ? session.activeSegmentStartedAt
    : session.status === "active" || session.status === "starting" ? session.startedAt : null;

  return {
    ...session,
    activeSegmentStartedAt,
    pausedAt: session.pausedAt ?? null,
    accumulatedFocusSeconds,
    remainingFocusSeconds,
    selfDepositPoints: session.selfDepositPoints ?? 0,
    result: session.result ?? null,
    updatedAt: session.updatedAt ?? session.startedAt
  };
});
export type CanonicalFocusSession = z.infer<typeof canonicalFocusSessionSchema>;

export function completionPercentForGoals(totalGoalCount: number, completedGoalCount: number): 0 | 60 | 80 | 100 {
  if (!Number.isSafeInteger(totalGoalCount) || totalGoalCount < 1) throw new Error("전체 목표 수가 올바르지 않습니다.");
  if (!Number.isSafeInteger(completedGoalCount) || completedGoalCount < 0 || completedGoalCount > totalGoalCount) {
    throw new Error("완료 목표 수가 올바르지 않습니다.");
  }
  if (completedGoalCount === 0) return 0;
  if (completedGoalCount === totalGoalCount) return 100;
  return completedGoalCount * 2 >= totalGoalCount ? 80 : 60;
}

const bridgeEnvelopeSchema = z.object({
  version: z.literal(1),
  requestId: z.string().trim().min(1).max(128)
});

export const webToExtensionMessageSchema = z.discriminatedUnion("type", [
  bridgeEnvelopeSchema.extend({ type: z.literal("mirujima:ping"), expectedUserId: z.string().uuid().optional() }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("mirujima:focus-sync-request"),
    scheduleId: z.string().trim().min(1).max(300),
    sessionId: z.string().trim().min(1).max(300)
  }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("mirujima:focus-reconcile-request"),
    scheduleId: z.string().trim().min(1).max(300),
    sessionId: z.string().trim().min(1).max(300)
  }),
  bridgeEnvelopeSchema.extend({ type: z.literal("mirujima:get-focus-status") })
]);
export type WebToExtensionMessage = z.infer<typeof webToExtensionMessageSchema>;

export function parseWebToExtensionMessage(value: unknown): WebToExtensionMessage {
  return webToExtensionMessageSchema.parse(value);
}

export function remainingFocusMs(endsAt: string, now = Date.now()): number {
  const end = Date.parse(endsAt);
  return Number.isFinite(end) ? Math.max(0, end - now) : 0;
}

export const historyPeriodSchema = z.enum(["daily", "weekly", "monthly"]);
export type HistoryPeriod = z.infer<typeof historyPeriodSchema>;

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const historyRangeSchema = z.object({ startDate: dateKeySchema, endDate: dateKeySchema });
const historyCompletionPercentSchema = z.union([z.literal(0), z.literal(60), z.literal(80), z.literal(100)]);

export const studentFocusHistorySchema = z.object({
  timezone: z.string().optional(),
  goals: z.array(z.object({ name: z.string(), plannedMinutes: z.number().int().min(0), actualFocusMinutes: z.number().nullable(), goalCount: z.number().int().min(0) })).optional(),
  hourlyStarts: z.array(z.object({ hour: z.number().int().min(0).max(23), sessionCount: z.number().int().min(0) })).max(24).optional(),
  period: historyPeriodSchema,
  range: historyRangeSchema,
  summary: z.object({
    selfDepositConversionRate: z.number().int().min(0).max(100).nullable().optional(),
    totalFocusSeconds: z.number().int().min(0).optional(),
    completionRate: z.number().int().min(0).max(100),
    totalFocusMinutes: z.number().int().min(0),
    successfulSessionCount: z.number().int().min(0),
    failedSessionCount: z.number().int().min(0),
    completedGoalCount: z.number().int().min(0),
    totalGoalCount: z.number().int().min(0),
    focusStreakDays: z.number().int().min(0).max(365),
    earnedPoints: z.number().int().min(0),
    returnedPoints: z.number().int().min(0),
    blockedAttemptCount: z.number().int().min(0),
  }),
  trend: z.array(z.object({
    dateKey: dateKeySchema,
    focusSeconds: z.number().int().min(0).optional(),
    focusMinutes: z.number().int().min(0),
    successfulSessionCount: z.number().int().min(0),
    failedSessionCount: z.number().int().min(0),
    completionRate: z.number().int().min(0).max(100),
  })).max(31),
  sessionCount: z.number().int().min(0),
  sessionsTruncated: z.boolean(),
  sessions: z.array(z.object({
    sessionId: z.string().trim().min(1).max(300),
    scheduleId: z.string().trim().min(1).max(300),
    dateKey: dateKeySchema,
    startedAt: isoDateTimeSchema,
    settledAt: isoDateTimeSchema,
    status: z.enum(["success", "failed", "cancelled"]),
    focusMinutes: z.number().int().min(0),
    targetFocusMinutes: z.number().int().min(1).max(720),
    completionPercent: historyCompletionPercentSchema,
    completedGoalCount: z.number().int().min(0).max(100),
    totalGoalCount: z.number().int().min(0).max(100),
    earnedPoints: z.number().int().min(0),
    returnedPoints: z.number().int().min(0),
    blockedAttemptCount: z.number().int().min(0),
    goals: z.array(z.object({
      goalId: z.string().trim().min(1).max(128),
      name: z.string().trim().min(1).max(120),
      minutes: z.number().int().min(1).max(720),
      priority: z.enum(["low", "medium", "high"]),
      completed: z.boolean(),
    })).max(100),
  })).max(200),
});
export type StudentFocusHistory = z.infer<typeof studentFocusHistorySchema>;

export const guardianFocusHistorySchema = z.object({
  student: z.object({ userId: z.string().uuid(), displayName: z.string().trim().min(1).max(120) }),
  period: historyPeriodSchema,
  range: historyRangeSchema,
  sharing: z.object({ completion: z.boolean(), totalFocusMinutes: z.boolean(), rewardStatus: z.boolean() }),
  summary: z.object({
    completionRate: z.number().int().min(0).max(100).nullable(),
    totalFocusMinutes: z.number().int().min(0).nullable(),
    completedGoalCount: z.number().int().min(0).nullable(),
    rewardCount: z.number().int().min(0).nullable(),
  }),
  trend: z.array(z.object({
    dateKey: dateKeySchema,
    completionRate: z.number().int().min(0).max(100).nullable(),
    focusMinutes: z.number().int().min(0).nullable(),
  })).max(31),
});
export type GuardianFocusHistory = z.infer<typeof guardianFocusHistorySchema>;

export const guardianRewardRequestStatusSchema = z.enum([
  "pending", "approved", "completed", "returned", "declined", "expired", "cancelled",
]);
export type GuardianRewardRequestStatus = z.infer<typeof guardianRewardRequestStatusSchema>;

export const guardianRewardRequestSchema = z.object({
  id: z.string().uuid(),
  studentUserId: z.string().uuid(),
  studentDisplayName: z.string().trim().min(1).max(120),
  points: z.number().int().positive().max(1_000_000_000),
  scheduleId: z.string().trim().min(1).max(300),
  sessionId: z.string().trim().min(1).max(300),
  status: guardianRewardRequestStatusSchema,
  createdAt: isoDateTimeSchema,
});
export type GuardianRewardRequest = z.infer<typeof guardianRewardRequestSchema>;

export const guardianRewardRequestListSchema = z.object({
  items: z.array(guardianRewardRequestSchema).max(100),
});

export const guardianRewardActionResultSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["approved", "declined"]),
  points: z.number().int().positive().max(1_000_000_000),
  studentUserId: z.string().uuid(),
  reservationId: z.string().uuid().optional(),
});
export type GuardianRewardActionResult = z.infer<typeof guardianRewardActionResultSchema>;

export const serverNotificationKindSchema = z.enum([
  "family_link_code_issued", "family_linked", "family_disconnected",
  "focus_plan_created", "focus_plan_updated", "focus_started", "focus_completed", "focus_failed",
  "guardian_reward_requested", "guardian_reward_approved", "guardian_reward_declined", "guardian_reward_released",
  "wallet_topup_completed", "wallet_refund_completed", "cashout_requested", "cashout_completed",
  "membership_activated", "membership_expiring", "ai_summary_ready",
]);
export type ServerNotificationKind = z.infer<typeof serverNotificationKindSchema>;

export const serverNotificationSchema = z.object({
  id: z.string().uuid(),
  kind: serverNotificationKindSchema,
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  data: z.record(z.string(), z.unknown()),
  readAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type ServerNotification = z.infer<typeof serverNotificationSchema>;

export const notificationCursorSchema = z.object({
  createdAt: isoDateTimeSchema,
  id: z.string().uuid(),
});
export type NotificationCursor = z.infer<typeof notificationCursorSchema>;

export const notificationPageSchema = z.object({
  items: z.array(serverNotificationSchema).max(50),
  unreadCount: z.number().int().min(0),
  nextCursor: notificationCursorSchema.nullable(),
});
export type NotificationPage = z.infer<typeof notificationPageSchema>;

export const plannedGuardianRewardSchema = z.object({
  requestId: z.string().uuid(),
  studentUserId: z.string().uuid(),
  scheduleId: z.string().trim().min(1).max(300),
  sessionId: z.string().uuid(),
  points: z.number().int().positive().max(1_000_000_000),
  status: z.enum(["pending", "approved", "started", "completed", "returned", "declined"]),
});
export type PlannedGuardianReward = z.infer<typeof plannedGuardianRewardSchema>;
