import { focusGoalsSchema, normalizeHostname, type FocusGoal } from "@mirujima/contracts";
import { z } from "zod";

const focusDraftSchema = z.object({
  title: z.string().trim().min(1, "계획명을 입력해 주세요.").max(120),
  targetFocusMinutes: z.coerce.number().int("집중 시간은 정수여야 합니다.").min(1, "집중 시간은 1분 이상이어야 합니다.").max(720),
  selfDepositPoints: z.coerce.number().int("걸 포인트는 정수여야 합니다.").min(0, "걸 포인트는 0P 이상이어야 합니다.").max(1_000_000_000),
  breakMinutes: z.coerce.number().int().min(1).max(120),
  blockingMode: z.enum(["allowlist", "blocklist", "off"]),
  domains: z.string(),
});

export interface FocusDraft {
  title: string;
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
      .map(normalizeHostname),
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
