import { useApp } from "../../shared/ui/AppContext";
import { EmptyState, ProgressBar } from "../../shared/ui/components";
import { toDateKey } from "../../shared/time/time";
import { LearningGrass } from "../learning-grass/LearningGrass";

export function ReportsPage() {
  const { snapshot, run } = useApp();
  const reports = snapshot.reports.slice().sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  return <section className="reports-page">
    <header className="reports-page-header"><div><h1 className="page-title">리포트</h1><p className="page-lead">일일 기록과 Premium 365일 학습 흐름을 확인합니다.</p></div><button className="button secondary" onClick={() => run({ type: "GENERATE_DAILY_REPORT", dateKey: toDateKey() })}>오늘 기록 집계</button></header>
    <LearningGrass />
    {reports.length === 0 ? <EmptyState>완료된 집중 기록이 쌓이면 리포트가 생성됩니다.</EmptyState> : <div className="report-list">{reports.map((report) => <article className="card report-card" key={report.id}>
      <header className="report-card-header"><div><span className="eyebrow">일일 집중 리포트</span><h2>{report.dateKey}</h2></div><span className="badge">{report.completedCount}/{report.plannedCount} 완료</span></header>

      <section className="report-metrics" aria-label="일일 핵심 지표">
        <div className="report-metric primary"><span>실제 집중</span><strong>{report.actualFocusMinutes}</strong><small>/ {report.plannedFocusMinutes}분</small></div>
        <div className="report-metric"><span>차단 시도</span><strong>{report.blockedAttemptCount}</strong><small>회</small></div>
        <div className="report-metric"><span>미루기</span><strong>{report.snoozeCount}</strong><small>회</small></div>
        <div className="report-metric"><span>자리 비움</span><strong>{report.idleMinutes}</strong><small>분</small></div>
        <div className="report-metric"><span>휴식 사용</span><strong>{report.breakMinutes ?? 0}</strong><small>분</small></div>
      </section>

      <section className="report-progress-section">
        <div className="report-progress-item"><ProgressBar value={report.achievementRate} label="일정 달성률" /></div>
        <div className="report-progress-item"><ProgressBar value={report.focusRate} label="집중 시간 달성률" /></div>
      </section>

      <section className="report-summary">
        <span className="focus-section-label">오늘의 요약</span>
        <p>{report.summary}</p>
        {report.bestScheduleTitle && <div className="report-best-task"><span>가장 집중한 일정</span><strong>{report.bestScheduleTitle}</strong></div>}
      </section>
    </article>)}</div>}
  </section>;
}
