"use client";

import { useState } from "react";
import { BarChart3, Calendar, Flame, HelpCircle, ShieldAlert, Target, X } from "lucide-react";
import type { HistoryPeriod, StudentFocusHistory } from "@mirujima/contracts";
import { HistoryControls } from "./history-controls";
import { formatFocusMinutes, formatHistoryRange, shortDateLabel, trendBarPercent } from "./history-format";

export function StudentHistoryDashboard({ history, error, period, anchorDate }: { history: StudentFocusHistory | null; error: string | null; period: HistoryPeriod; anchorDate: string }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const focusValues = history?.trend.map((item) => item.focusMinutes) ?? [];
  return <>
    <div className="page-heading history-heading">
      <div><p className="eyebrow">학습 분석 및 기록 리포트</p><h1>집중 기록 및 리포트</h1><p>{history ? formatHistoryRange(period, history.range.startDate, history.range.endDate) : anchorDate.replaceAll("-", ".")}</p></div>
      <div className="history-heading-actions"><button className="button secondary small" type="button" onClick={() => setGuideOpen(true)}><HelpCircle className="w-4 h-4" />기록 사용법</button><HistoryControls period={period} anchorDate={anchorDate} /></div>
    </div>

    {error ? <section className="card history-state error" role="alert"><strong>기록을 표시하지 못했습니다.</strong><p>{error}</p></section> : null}
    {history ? <>
      <section className="metric-grid history-metric-grid">
        <Metric label="계획 달성률" value={`${history.summary.completionRate}%`} detail={`완료 목표 ${history.summary.completedGoalCount}/${history.summary.totalGoalCount}`} />
        <Metric label="총 집중 시간" value={formatFocusMinutes(history.summary.totalFocusMinutes)} detail={`성공 ${history.summary.successfulSessionCount} · 실패 ${history.summary.failedSessionCount}`} />
        <Metric label="연속 집중" value={`${history.summary.focusStreakDays}일`} detail="성공 세션이 있는 연속 날짜" />
        <Metric label="획득 포인트" value={`${history.summary.earnedPoints.toLocaleString()}P`} detail={`반환 ${history.summary.returnedPoints.toLocaleString()}P`} />
        <Metric label="차단 시도" value={`${history.summary.blockedAttemptCount}회`} detail="원본 사이트 정보는 저장하지 않음" />
        <Metric label="기록된 세션" value={`${history.sessionCount}개`} detail={history.sessionsTruncated ? "최신 200개 표시" : "조회 기간 전체"} />
      </section>

      <section className="card chart-card history-chart-card">
        <div className="history-section-heading"><div><span className="card-label">날짜별 집중 추이</span><h2>집중 시간과 달성률</h2></div><BarChart3 className="w-5 h-5 text-muted" /></div>
        <div className="history-bars" role="img" aria-label="날짜별 집중 시간 막대 차트">{history.trend.map((item) => <div className="history-bar-column" key={item.dateKey}><span>{item.focusMinutes}분</span><div className="history-bar-track"><i style={{ height: `${trendBarPercent(item.focusMinutes, focusValues)}%` }} /></div><strong>{shortDateLabel(item.dateKey)}</strong></div>)}</div>
        <div className="history-table-wrap"><table className="history-table"><caption>날짜별 집중 기록 표</caption><thead><tr><th>날짜</th><th>집중 시간</th><th>달성률</th><th>성공</th><th>실패</th></tr></thead><tbody>{history.trend.map((item) => <tr key={item.dateKey}><td>{item.dateKey}</td><td>{item.focusMinutes}분</td><td>{item.completionRate}%</td><td>{item.successfulSessionCount}</td><td>{item.failedSessionCount}</td></tr>)}</tbody></table></div>
      </section>

      <section className="card chart-card history-session-section">
        <div className="history-section-heading"><div><span className="card-label">목표 실행 및 결과</span><h2>집중 성과 상세 기록</h2></div><Target className="w-5 h-5 text-muted" /></div>
        {history.sessions.length === 0 ? <div className="chart-placeholder"><p>이 기간에 완료된 집중 세션이 없습니다.</p></div> : <div className="history-session-list">{history.sessions.map((session) => <article className="history-session-card" key={session.sessionId}>
          <header><div><span>{session.dateKey}</span><strong>{session.status === "success" ? "집중 성공" : session.status === "failed" ? "집중 실패" : "집중 취소"}</strong></div><b className={session.completionPercent === 0 ? "failed" : ""}>{session.completionPercent}%</b></header>
          <div className="history-session-meta"><span>집중 {session.focusMinutes}분 / 목표 {session.targetFocusMinutes}분</span><span>획득 {session.earnedPoints.toLocaleString()}P</span><span>차단 시도 {session.blockedAttemptCount}회</span></div>
          <ul>{session.goals.map((goal) => <li key={goal.goalId} className={goal.completed ? "completed" : ""}><span>{goal.completed ? "✓" : "–"}</span><div><strong>{goal.name}</strong><small>{goal.minutes}분 · 우선순위 {goal.priority === "high" ? "높음" : goal.priority === "medium" ? "중간" : "낮음"}</small></div></li>)}</ul>
        </article>)}</div>}
      </section>
    </> : !error ? <section className="card history-state"><strong>기록을 준비하고 있습니다.</strong></section> : null}

    {guideOpen ? <div className="modal-overlay" onClick={() => setGuideOpen(false)}><div className="modal-content" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-gray-100 pb-3"><h2>기록 및 리포트 사용법</h2><button className="icon-close-button" onClick={() => setGuideOpen(false)} aria-label="닫기"><X className="w-4 h-4" /></button></div><div className="history-guide-list"><p><Calendar className="w-5 h-5" /><span><strong>기간별 기록</strong>일·주·월 단위로 실제 완료된 서버 세션을 확인합니다.</span></p><p><Flame className="w-5 h-5" /><span><strong>연속 집중</strong>성공 세션이 있는 날짜가 연속되면 스트릭이 이어집니다.</span></p><p><ShieldAlert className="w-5 h-5" /><span><strong>개인정보 보호</strong>차단 시도 횟수만 집계하며 사이트 원본은 기록하지 않습니다.</span></p></div><button className="button full" type="button" onClick={() => setGuideOpen(false)}>확인했습니다</button></div></div> : null}
  </>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="card metric"><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>;
}
