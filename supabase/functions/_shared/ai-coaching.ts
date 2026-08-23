export interface FocusCoachInput {
  title: string;
  targetFocusMinutes: number;
  goals: Array<{ name: string; detail: string; minutes: number }>;
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validText(value: unknown, max: number): boolean {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= max;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function stringList(value: unknown, minimum: number, maximum: number, itemMax = 1_000): string[] | null {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return null;
  if (!value.every((item) => validText(item, itemMax))) return null;
  return value.map((item) => (item as string).trim());
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function parseFocusCoachInput(value: Record<string, unknown>): FocusCoachInput | null {
  const title = boundedText(value.title, 120);
  const targetFocusMinutes = boundedInteger(value.targetFocusMinutes, 1, 720);
  if (!title || targetFocusMinutes === null || !Array.isArray(value.goals) || value.goals.length < 1 || value.goals.length > 10) return null;
  const goals: FocusCoachInput["goals"] = [];
  for (const candidate of value.goals) {
    if (!candidate || typeof candidate !== "object") return null;
    const item = candidate as Record<string, unknown>;
    const name = boundedText(item.name, 120);
    const detail = boundedText(item.detail, 500);
    const minutes = boundedInteger(item.minutes, 1, 720);
    if (!name || minutes === null) return null;
    goals.push({ name, detail, minutes });
  }
  return { title, targetFocusMinutes, goals };
}

export function isFocusCoachResult(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return Boolean(
    hasOnlyKeys(item, ["summary", "recommendedTitle", "recommendedFocusMinutes", "recommendedBreakMinutes", "steps", "reason"])
    && validText(item.summary, 1_000)
    && validText(item.recommendedTitle, 120)
    && boundedInteger(item.recommendedFocusMinutes, 1, 720) !== null
    && boundedInteger(item.recommendedBreakMinutes, 0, 120) !== null
    && stringList(item.steps, 1, 6)
    && validText(item.reason, 1_000)
  );
}

export function isGuardianSummaryResult(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return Boolean(hasOnlyKeys(item, ["title", "summary", "suggestions"])
    && validText(item.title, 120) && validText(item.summary, 1_000) && stringList(item.suggestions, 1, 4));
}

export function isStudyRecommendationResult(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (!hasOnlyKeys(item, ["title", "summary", "recommendedOrder", "nextAction"])
    || !validText(item.title, 120) || !validText(item.summary, 1_000) || !validText(item.nextAction, 1_000)
    || !Array.isArray(item.recommendedOrder) || item.recommendedOrder.length < 1 || item.recommendedOrder.length > 5) return false;
  return item.recommendedOrder.every((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const order = candidate as Record<string, unknown>;
    return Boolean(hasOnlyKeys(order, ["subject", "focusMinutes", "reason"])
      && validText(order.subject, 120)
      && boundedInteger(order.focusMinutes, 5, 180) !== null
      && validText(order.reason, 1_000));
  });
}

export function isWeeklyReportResult(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return Boolean(
    hasOnlyKeys(item, ["title", "achievementSummary", "wins", "improvements", "nextWeekPlan"])
    && validText(item.title, 120)
    && validText(item.achievementSummary, 1_000)
    && stringList(item.wins, 1, 4)
    && stringList(item.improvements, 1, 4)
    && stringList(item.nextWeekPlan, 1, 4)
  );
}

export function minimalStudentHistory(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const history = value as Record<string, unknown>;
  const summary = history.summary && typeof history.summary === "object" ? history.summary as Record<string, unknown> : {};
  const integer = (key: string, max: number) => Math.max(0, Math.min(max, Number(summary[key]) || 0));
  const trend = Array.isArray(history.trend) ? history.trend.slice(-7).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    const dateKey = boundedText(item.dateKey, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? [{
      dateKey,
      focusMinutes: Math.max(0, Math.min(1_440, Number(item.focusMinutes) || 0)),
      completionRate: Math.max(0, Math.min(100, Number(item.completionRate) || 0)),
    }] : [];
  }) : [];
  const goalMap = new Map<string, { name: string; minutes: number; completedCount: number }>();
  if (Array.isArray(history.sessions)) {
    for (const session of history.sessions.slice(0, 30)) {
      if (!session || typeof session !== "object" || !Array.isArray((session as Record<string, unknown>).goals)) continue;
      for (const goal of ((session as Record<string, unknown>).goals as unknown[]).slice(0, 20)) {
        if (!goal || typeof goal !== "object") continue;
        const item = goal as Record<string, unknown>;
        const name = boundedText(item.name, 120);
        if (!name) continue;
        const current = goalMap.get(name) ?? { name, minutes: 0, completedCount: 0 };
        current.minutes += Math.max(1, Math.min(720, Number(item.minutes) || 1));
        current.completedCount += item.completed === true ? 1 : 0;
        goalMap.set(name, current);
      }
    }
  }
  return {
    summary: {
      completionRate: integer("completionRate", 100),
      totalFocusMinutes: integer("totalFocusMinutes", 10_080),
      successfulSessionCount: integer("successfulSessionCount", 1_000),
      failedSessionCount: integer("failedSessionCount", 1_000),
      focusStreakDays: integer("focusStreakDays", 365),
    },
    trend,
    recentGoals: [...goalMap.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 12),
  };
}

export function minimalGuardianAggregates(value: unknown): Array<Record<string, unknown>> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const students = value.slice(0, 5).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    return [{
      displayName: boundedText(item.displayName, 80) || "학생",
      completionRate: Math.max(0, Math.min(100, Number(item.completionRate) || 0)),
      totalFocusMinutes: Math.max(0, Math.min(10_080, Number(item.totalFocusMinutes) || 0)),
      rewardStatus: boundedText(item.rewardStatus, 80) || "공유 안 함",
      aiSummary: boundedText(item.aiSummary, 1_000) || null,
    }];
  });
  return students.length ? students : null;
}
