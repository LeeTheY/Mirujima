import type { HistoryPeriod } from "@mirujima/contracts";

export function formatFocusMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}시간` : `${hours}시간 ${remainder}분`;
}

export function formatHistoryRange(period: HistoryPeriod, startDate: string, endDate: string): string {
  if (period === "daily") return startDate.replaceAll("-", ".");
  if (period === "monthly") return `${startDate.slice(0, 4)}년 ${Number(startDate.slice(5, 7))}월`;
  return `${startDate.replaceAll("-", ".")} – ${endDate.replaceAll("-", ".")}`;
}

export function trendBarPercent(value: number, values: number[]): number {
  const max = Math.max(0, ...values);
  return max === 0 ? 0 : Math.max(4, Math.round(value / max * 100));
}

export function shortDateLabel(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}
