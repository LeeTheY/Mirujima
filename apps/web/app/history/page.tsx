import { DashboardShell } from "@/components/dashboard-shell";

export default function HistoryPage() {
  return <DashboardShell role="student" activeHref="/history"><div className="page-heading"><div><p className="eyebrow">HISTORY</p><h1>집중 기록</h1><p>완료된 세션을 기준으로 집중 흐름을 확인합니다.</p></div><div className="segmented static"><span className="selected">일별</span><span>주별</span><span>월별</span></div></div><section className="metric-grid">{[["목표 달성률","0%"],["총 집중 시간","0분"],["완료 세션","0개"],["연속 집중","0일"]].map(([label,value]) => <article className="card metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section><section className="card chart-card"><div><span className="card-label">일별 집중 시간</span><h2>첫 기록을 기다리고 있어요.</h2></div><div className="chart-placeholder" aria-label="집중 기록 없음"><span>집중 세션을 완료하면 차트가 표시됩니다.</span></div></section></DashboardShell>;
}
