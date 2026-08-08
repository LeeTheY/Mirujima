import { DashboardShell } from "@/components/dashboard-shell";

export default function GuardianHistoryPage() {
  return <DashboardShell role="guardian" activeHref="/guardian/history"><div className="page-heading"><div><p className="eyebrow">FAMILY HISTORY</p><h1>학생 기록</h1><p>학생이 공유에 동의한 집계 정보만 표시됩니다.</p></div></div><section className="card chart-card"><h2>먼저 학생을 연결해 주세요.</h2><p>연결된 학생이 생기면 달성 여부, 총 집중 시간과 보상 상태를 확인할 수 있습니다.</p></section></DashboardShell>;
}
