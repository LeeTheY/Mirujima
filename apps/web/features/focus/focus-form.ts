import { focusGoalsSchema, normalizeHostname, type FocusGoal } from "@mirujima/contracts";
import { z } from "zod";

const focusDraftSchema = z.object({
  title: z.string().trim().min(1, "계획명을 입력해 주세요.").max(120),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "계획 날짜를 선택해 주세요.").refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "존재하는 날짜를 선택해 주세요."),
  description: z.string().trim().max(2000).default(""),
  activityMode: z.enum(["interactive", "reading", "watching", "offline"]).default("interactive"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  guardianRewardRequestPoints: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  targetFocusMinutes: z.coerce.number().int("집중 시간은 정수여야 합니다.").min(1, "집중 시간은 1분 이상이어야 합니다.").max(720),
  selfDepositPoints: z.coerce.number().int("걸 포인트는 정수여야 합니다.").min(0, "걸 포인트는 0P 이상이어야 합니다.").max(1_000_000_000),
  breakMinutes: z.coerce.number().int().min(1).max(120),
  blockingMode: z.enum(["allowlist", "blocklist", "off"]),
  domains: z.string(),
});

export interface FocusDraft {
  title: string;
  dateKey: string;
  description: string;
  activityMode: "interactive" | "reading" | "watching" | "offline";
  priority: "low" | "medium" | "high";
  guardianRewardRequestPoints: number;
  targetFocusMinutes: number;
  selfDepositPoints: number;
  breakMinutes: number;
  blockingMode: "allowlist" | "blocklist" | "off";
  domains: string[];
}

export function parseFocusDraft(input: unknown): FocusDraft {
  const parsed = focusDraftSchema.parse(input);
  return {
    ...parsed,
    domains: parsed.domains
      .split(/[\n,]/)
      .map((domain) => domain.trim())
      .filter(Boolean)
      .map((domain) => {
        if (/^[a-z][a-z\d+.-]*:\/\//i.test(domain) && !/^https?:\/\//i.test(domain)) {
          throw new Error("HTTP 또는 HTTPS 사이트만 차단 설정에 사용할 수 있습니다.");
        }
        return normalizeHostname(domain);
      }),
  };
}

export function parseFocusGoals(input: unknown): FocusGoal[] {
  const result = focusGoalsSchema.safeParse(input);
  if (!result.success) {
    throw new Error("각 목표의 이름과 집중 시간을 올바르게 입력해 주세요.");
  }
  return result.data;
}

export function completionPercentForGoals(totalGoalCount: number, completedGoalCount: number): 0 | 60 | 80 | 100 {
  if (!Number.isSafeInteger(totalGoalCount) || totalGoalCount < 1) throw new Error("전체 목표 수가 올바르지 않습니다.");
  if (!Number.isSafeInteger(completedGoalCount) || completedGoalCount < 0 || completedGoalCount > totalGoalCount) {
    throw new Error("완료 목표 수가 올바르지 않습니다.");
  }
  if (completedGoalCount === 0) return 0;
  if (completedGoalCount === totalGoalCount) return 100;
  return completedGoalCount * 2 >= totalGoalCount ? 80 : 60;
}

/** Reconstruct approved plans even when disabled form fields omit FormData entries. */
export function focusDraftFromPlan(plan: import("@mirujima/contracts").FocusPlan): FocusDraft {
  return {
    title: plan.title, dateKey: plan.dateKey, description: plan.description,
    activityMode: plan.activityMode, priority: plan.priority,
    guardianRewardRequestPoints: plan.guardianRewardRequestPoints,
    targetFocusMinutes: plan.targetFocusMinutes, selfDepositPoints: plan.selfDepositPoints,
    breakMinutes: plan.breakMinutes, blockingMode: plan.blockingMode,
    domains: (plan.blockingMode === "allowlist" ? plan.allowedDomains : plan.blockedDomains).map((rule) => rule.hostname),
  };
}

export function focusPlanMatchesDraft(plan: import("@mirujima/contracts").FocusPlan, draft: FocusDraft, goals: FocusGoal[]): boolean {
  const stored = focusDraftFromPlan(plan);
  return JSON.stringify({ ...stored, domains: [...new Set(stored.domains)].sort() }) ===
    JSON.stringify({ ...draft, domains: [...new Set(draft.domains)].sort() }) && JSON.stringify(plan.goals) === JSON.stringify(goals);
}
