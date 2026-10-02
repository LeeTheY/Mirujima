import { historyPeriodSchema, type HistoryPeriod } from "@mirujima/contracts";

export interface HistoryQuery {
  period: HistoryPeriod;
  anchorDate: string;
  studentId: string | null;
}

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function dateKeyInTimeZone(now = new Date(), timeZone = "Asia/Seoul"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function validDateKey(value: string | undefined): value is string {
  if (!value || !dateKeyPattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeHistoryQuery(
  params: { period?: string; date?: string; student?: string },
  now = new Date(),
  timeZone = "Asia/Seoul",
): HistoryQuery {
  const parsedPeriod = historyPeriodSchema.safeParse(params.period);
  const today = dateKeyInTimeZone(now, timeZone);
  const earliest = earliestHistoryDate(now, timeZone);
  const anchorDate = validDateKey(params.date) && params.date <= today
    ? params.date < earliest ? earliest : params.date
    : today;
  return {
    period: parsedPeriod.success ? parsedPeriod.data : "daily",
    anchorDate,
    studentId: params.student && uuidPattern.test(params.student) ? params.student.toLowerCase() : null,
  };
}

export function earliestHistoryDate(now = new Date(), timeZone = "Asia/Seoul"): string {
  const [year, month, day] = dateKeyInTimeZone(now, timeZone).split("-").map(Number);
  const earliest = new Date(Date.UTC(year, month - 1, day));
  earliest.setUTCDate(earliest.getUTCDate() - 364);
  return earliest.toISOString().slice(0, 10);
}

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function shiftHistoryAnchor(dateKey: string, period: HistoryPeriod, direction: -1 | 1): string {
  if (!validDateKey(dateKey)) throw new Error("기록 기준 날짜가 올바르지 않습니다.");
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (period === "monthly") {
    const nextMonthIndex = date.getUTCMonth() + direction;
    const nextYear = date.getUTCFullYear() + Math.floor(nextMonthIndex / 12);
    const normalizedMonth = ((nextMonthIndex % 12) + 12) % 12;
    date.setUTCFullYear(nextYear, normalizedMonth, Math.min(day, daysInUtcMonth(nextYear, normalizedMonth)));
  } else {
    date.setUTCDate(date.getUTCDate() + direction * (period === "weekly" ? 7 : 1));
  }
  return date.toISOString().slice(0, 10);
}

export function historyHref(period: HistoryPeriod, anchorDate: string, studentId?: string | null): string {
  const query = new URLSearchParams({ period, date: anchorDate });
  if (studentId) query.set("student", studentId);
  return `?${query.toString()}`;
}
