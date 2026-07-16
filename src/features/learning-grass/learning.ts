import type { DailyReport } from "../../shared/types/models";

export interface LearningDay {
  dateKey: string;
  actualFocusMinutes: number;
  completedScheduleCount: number;
  achievementRate: number;
  learningScore: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export function learningIntensity(score: number): 0 | 1 | 2 | 3 | 4 {
  if (score <= 0) return 0;
  if (score < 30) return 1;
  if (score < 60) return 2;
  if (score < 120) return 3;
  return 4;
}

export function learningDayFromReport(report: DailyReport): LearningDay {
  const learningScore = Math.max(0, report.actualFocusMinutes) + Math.max(0, report.completedCount) * 10;
  return {
    dateKey: report.dateKey,
    actualFocusMinutes: Math.max(0, report.actualFocusMinutes),
    completedScheduleCount: Math.max(0, report.completedCount),
    achievementRate: Math.max(0, Math.min(100, report.achievementRate)),
    learningScore,
    intensity: learningIntensity(learningScore)
  };
}

function previousDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function calculateLearningStreak(days: LearningDay[], todayKey: string): number {
  const activeDays = new Set(days.filter((day) => day.learningScore > 0).map((day) => day.dateKey));
  let cursor = todayKey;
  let streak = 0;
  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = previousDateKey(cursor);
  }
  return streak;
}

export function monthDateKeys(year: number, monthIndex: number): Array<string | null> {
  const first = new Date(year, monthIndex, 1);
  const count = new Date(year, monthIndex + 1, 0).getDate();
  return [
    ...Array.from<null>({ length: first.getDay() }).fill(null),
    ...Array.from({ length: count }, (_, index) => `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`)
  ];
}
