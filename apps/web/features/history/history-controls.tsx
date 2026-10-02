import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HistoryPeriod } from "@mirujima/contracts";
import { dateKeyInTimeZone, earliestHistoryDate, historyHref, shiftHistoryAnchor } from "./history-query";

export function HistoryControls({ period, anchorDate, studentId, timezone = "Asia/Seoul" }: { period: HistoryPeriod; anchorDate: string; studentId?: string | null; timezone?: string }) {
  const previous = shiftHistoryAnchor(anchorDate, period, -1);
  const next = shiftHistoryAnchor(anchorDate, period, 1);
  const canMovePrevious = previous >= earliestHistoryDate(new Date(), timezone);
  const canMoveNext = next <= dateKeyInTimeZone(new Date(), timezone);
  return <div className="history-controls">
    <div className="history-date-nav" aria-label="기록 기간 이동">
      {canMovePrevious ? <Link className="icon-button" href={historyHref(period, previous, studentId)} aria-label="이전 기간"><ChevronLeft className="w-4 h-4" /></Link> : <span className="icon-button disabled" aria-label="이전 기간 없음"><ChevronLeft className="w-4 h-4" /></span>}
      {canMoveNext ? <Link className="icon-button" href={historyHref(period, next, studentId)} aria-label="다음 기간"><ChevronRight className="w-4 h-4" /></Link> : <span className="icon-button disabled" aria-label="다음 기간 없음"><ChevronRight className="w-4 h-4" /></span>}
    </div>
    <div className="segmented static" aria-label="기록 기간">
      {(["daily", "weekly", "monthly"] as const).map((value) => <Link aria-current={period === value ? "page" : undefined} className={period === value ? "selected" : ""} href={historyHref(value, anchorDate, studentId)} key={value}>{value === "daily" ? "일별" : value === "weekly" ? "주별" : "월별"}</Link>)}
    </div>
  </div>;
}
