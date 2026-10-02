"use client";

import { useRouter } from "next/navigation";
import { BarChart3, LockKeyhole } from "lucide-react";
import type { GuardianFocusHistory, HistoryPeriod } from "@mirujima/contracts";
import type { LinkedStudent } from "@/features/family/linked-students";
import { HistoryControls } from "./history-controls";
import { formatFocusMinutes, formatHistoryRange, shortDateLabel, trendBarPercent } from "./history-format";
import { historyHref } from "./history-query";

export function GuardianHistoryDashboard({ students, selectedStudentId, history, error, period, anchorDate, timezone }: { students: LinkedStudent[]; selectedStudentId: string | null; history: GuardianFocusHistory | null; error: string | null; period: HistoryPeriod; anchorDate: string; timezone?: string }) {
  const router = useRouter();
  const focusValues = history?.trend.flatMap((item) => item.focusMinutes === null ? [] : [item.focusMinutes]) ?? [];
  return <>
    <div className="page-heading history-heading"><div><p className="eyebrow">FAMILY HISTORY</p><h1>학생 집중 기록</h1><p>{history ? `${history.student.displayName} · ${formatHistoryRange(period, history.range.startDate, history.range.endDate)}` : "학생이 공유에 동의한 집계 정보만 표시됩니다."}</p></div>{selectedStudentId ? <HistoryControls timezone={timezone} period={period} anchorDate={anchorDate} studentId={selectedStudentId} /> : null}</div>
    {students.length === 0 ? <section className="card history-state"><strong>먼저 학생을 연결해 주세요.</strong><p>연결된 학생이 생기면 동의된 달성률, 집중 시간과 보상 상태를 확인할 수 있습니다.</p></section> : <label className="history-student-selector">학생 선택<select value={selectedStudentId ?? ""} onChange={(event) => router.push(historyHref(period, anchorDate, event.target.value))}>{students.map((student) => <option key={student.studentUserId} value={student.studentUserId}>{student.displayName}</option>)}</select></label>}
    {error ? <section className="card history-state error" role="alert"><strong>학생 기록을 표시하지 못했습니다.</strong><p>{error}</p></section> : null}
    {history ? <>
      <section className="metric-grid"><GuardianMetric label="목표 달성률" value={history.summary.completionRate === null ? null : `${history.summary.completionRate}%`} /><GuardianMetric label="총 집중 시간" value={history.summary.totalFocusMinutes === null ? null : formatFocusMinutes(history.summary.totalFocusMinutes)} /><GuardianMetric label="완료 목표" value={history.summary.completedGoalCount === null ? null : `${history.summary.completedGoalCount}개`} /><GuardianMetric label="보상 상태" value={history.summary.rewardCount === null ? null : `${history.summary.rewardCount}건`} /></section>
      <section className="card chart-card history-chart-card"><div className="history-section-heading"><div><span className="card-label">공유된 집중 추이</span><h2>날짜별 가족 학습 기록</h2></div><BarChart3 className="w-5 h-5 text-muted" /></div>
        {!history.sharing.completion && !history.sharing.totalFocusMinutes ? <div className="history-private-state"><LockKeyhole className="w-6 h-6" /><strong>학생이 추이 공유를 끈 상태입니다.</strong><p>공유 설정이 바뀌면 허용된 집계만 이곳에 표시됩니다.</p></div> : <><div className="history-bars guardian" role="img" aria-label="공유된 날짜별 집중 추이">{history.trend.map((item) => <div className="history-bar-column" key={item.dateKey}><span>{item.focusMinutes === null ? "비공개" : `${item.focusMinutes}분`}</span><div className="history-bar-track"><i style={{ height: `${item.focusMinutes === null ? 0 : trendBarPercent(item.focusMinutes, focusValues)}%` }} /></div><strong>{shortDateLabel(item.dateKey)}</strong></div>)}</div><div className="history-table-wrap"><table className="history-table"><caption>학생이 공유한 날짜별 집중 기록</caption><thead><tr><th>날짜</th><th>집중 시간</th><th>달성률</th></tr></thead><tbody>{history.trend.map((item) => <tr key={item.dateKey}><td>{item.dateKey}</td><td>{item.focusMinutes === null ? "공유 안 함" : `${item.focusMinutes}분`}</td><td>{item.completionRate === null ? "공유 안 함" : `${item.completionRate}%`}</td></tr>)}</tbody></table></div></>}
      </section>
    </> : null}
  </>;
}

function GuardianMetric({ label, value }: { label: string; value: string | null }) {
  return <article className="card metric"><span>{label}</span>{value === null ? <div className="history-private-value"><LockKeyhole className="w-4 h-4" />공유 안 함</div> : <strong>{value}</strong>}<p>학생 공유 설정 기준</p></article>;
}
