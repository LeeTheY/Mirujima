import { DashboardShell } from "@/components/dashboard-shell";
import { requireAuthenticatedRole } from "@/features/auth/require-role";

export default async function GuardianHistoryPage() {
  await requireAuthenticatedRole("/guardian/history");
  return (
    <DashboardShell role="guardian" activeHref="/guardian/history">
      <div className="page-heading">
        <div>
          <p className="eyebrow">FAMILY HISTORY</p>
          <h1>학생 집중 기록</h1>
          <p>학생이 공유에 동의한 집계 정보만 표시됩니다.</p>
        </div>
        <div className="segmented static" aria-label="기록 기간"><span className="selected">일별</span><span>주별</span><span>월별</span></div>
      </div>
      <section className="metric-grid"><article className="card metric"><span>목표 달성률</span><strong>0%</strong><p>공유된 목표 기준</p></article><article className="card metric"><span>총 집중 시간</span><strong>0분</strong><p>학생 공유 설정 기준</p></article><article className="card metric"><span>완료 목표</span><strong>0개</strong><p>완료 단계 집계</p></article><article className="card metric"><span>보상 상태</span><strong>0건</strong><p>요청 및 지급 내역</p></article></section>
      <section className="card chart-card"><span className="card-label">학생 집중 기록</span><h2>먼저 학생을 연결해 주세요.</h2><p>연결된 학생이 생기면 달성 여부, 총 집중 시간과 보상 상태만 확인할 수 있습니다.</p></section>
    </DashboardShell>
  );
}
