export function toDateKey(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("유효하지 않은 날짜입니다.");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateKeyDaysAgo(days: number, from = new Date()): string {
  const value = new Date(from);
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() - days);
  return toDateKey(value);
}

export function elapsedFocusSeconds(
  startedAt: string,
  pausedAt: string | null,
  accumulatedFocusSeconds: number,
  now = Date.now()
): number {
  if (pausedAt) return Math.max(0, accumulatedFocusSeconds);
  const started = new Date(startedAt).getTime();
  return Math.max(0, accumulatedFocusSeconds + Math.floor((now - started) / 1000));
}

export function remainingFocusSeconds(targetFocusMinutes: number, elapsedSeconds: number): number {
  return Math.max(0, targetFocusMinutes * 60 - elapsedSeconds);
}

export function elapsedBreakSeconds(
  breakStartedAt: string | null | undefined,
  accumulatedBreakSeconds = 0,
  now = Date.now()
): number {
  if (!breakStartedAt) return Math.max(0, accumulatedBreakSeconds);
  const started = new Date(breakStartedAt).getTime();
  return Math.max(0, accumulatedBreakSeconds + Math.floor((now - started) / 1000));
}

export function getBreakTimeState(plannedSeconds: number, elapsedSeconds: number): { remaining: number; overtime: number } {
  return {
    remaining: Math.max(0, plannedSeconds - elapsedSeconds),
    overtime: Math.max(0, elapsedSeconds - plannedSeconds)
  };
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function hasOverlap(startAt: string, endAt: string, otherStart: string, otherEnd: string): boolean {
  return new Date(startAt).getTime() < new Date(otherEnd).getTime()
    && new Date(endAt).getTime() > new Date(otherStart).getTime();
}

export function startOfNextDay(from = new Date()): Date {
  const result = new Date(from);
  result.setHours(24, 0, 5, 0);
  return result;
}
