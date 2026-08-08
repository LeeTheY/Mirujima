import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";

export default function StudentHome() {
  return <DashboardShell role="student" activeHref="/home"><section className="dashboard-hero"><div><p className="eyebrow inverse">TODAY</p><h1>오늘의 계획을<br />집중으로 바꿔볼까요?</h1><p>첫 집중 계획을 만들면 이곳에서 진행 상황을 바로 확인할 수 있습니다.</p></div><Link className="button light" href="/focus">집중 계획 만들기</Link></section><section className="dashboard-grid"><article className="card challenge-card"><span className="card-label">오늘의 집중 챌린지</span><h2>아직 정해진 계획이 없습니다.</h2><p>작게 시작해도 좋습니다. 25분 집중부터 계획해 보세요.</p><Link href="/focus">첫 계획 만들기</Link></article><article className="card"><span className="card-label">내 지갑</span><h2>포인트 기능 준비 중</h2><p>결제와 원장 검증이 완료되기 전에는 잔액을 표시하거나 변경하지 않습니다.</p></article><article className="card wide"><span className="card-label">오늘의 목표 달성률</span><div className="empty-chart"><span>0%</span><div><i /></div><p>완료한 집중 세션이 생기면 달성률이 표시됩니다.</p></div></article><article className="card"><span className="card-label">최근 활동</span><p className="empty-state">아직 기록이 없습니다.</p></article></section></DashboardShell>;
}
