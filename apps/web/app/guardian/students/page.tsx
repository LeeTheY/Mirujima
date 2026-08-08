import { DashboardShell } from "@/components/dashboard-shell";
import { FamilyLinkPanel } from "@/features/family/family-link-panel";

export default function GuardianStudentsPage() {
  return <DashboardShell role="guardian" activeHref="/guardian/students"><div className="page-heading"><div><p className="eyebrow">STUDENT LINK</p><h1>학생 연결</h1><p>누구든 코드를 발급하고 상대방이 5분 안에 입력할 수 있습니다.</p></div></div><FamilyLinkPanel /><article className="card linked-list"><span className="card-label">연결된 학생</span><p className="empty-state">연결 정보는 로그인 후 서버에서 안전하게 불러옵니다.</p></article></DashboardShell>;
}
