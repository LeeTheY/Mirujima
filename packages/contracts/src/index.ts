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
  status: z.enum(["draft", "planned", "ready", "active", "completed", "failed", "cancelled"]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});
export type FocusPlan = z.infer<typeof focusPlanSchema>;

export function normalizeFocusPlan(value: unknown): FocusPlan {
  return focusPlanSchema.parse(value);
}

export const canonicalFocusSessionSchema = z.object({
  id: z.string().trim().min(1).max(300),
  scheduleId: z.string().trim().min(1).max(300),
  ownerUserId: z.string().uuid(),
  startedAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  targetFocusMinutes: z.number().int().min(1).max(720),
  blockingMode: z.enum(["allowlist", "blocklist", "off"]),
  status: z.enum(["starting", "active", "paused", "awaiting-result", "success", "failed", "cancelled"])
});
export type CanonicalFocusSession = z.infer<typeof canonicalFocusSessionSchema>;

const bridgeEnvelopeSchema = z.object({
  version: z.literal(1),
  requestId: z.string().trim().min(1).max(128)
});

export const webToExtensionMessageSchema = z.discriminatedUnion("type", [
  bridgeEnvelopeSchema.extend({ type: z.literal("mirujima:ping") }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("mirujima:focus-sync-request"),
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
