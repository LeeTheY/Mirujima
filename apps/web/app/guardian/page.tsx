import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";

export default function GuardianHome() {
  return <DashboardShell role="guardian" activeHref="/guardian"><section className="dashboard-hero guardian"><div><p className="eyebrow inverse">FAMILY FOCUS</p><h1>과정은 존중하고,<br />성취를 함께 응원하세요.</h1><p>학생이 동의한 집중 결과만 안전하게 확인합니다.</p></div><Link className="button light" href="/guardian/students">학생 연결하기</Link></section><section className="dashboard-grid"><article className="card wide"><span className="card-label">연결 학생</span><h2>연결된 학생이 없습니다.</h2><p>5분 동안 유효한 6자리 코드로 학생 계정을 연결할 수 있습니다.</p><Link href="/guardian/students">연결 코드 입력</Link></article><article className="card"><span className="card-label">학생 집중 지표</span><p className="empty-state">학생 연결 후 동의된 지표가 표시됩니다.</p></article><article className="card"><span className="card-label">포인트 지원</span><p>금융 원장과 결제 검증이 완료된 뒤 활성화됩니다.</p></article><article className="card wide"><span className="card-label">가족 협력 가이드</span><h2>결과보다 시작한 과정을 물어보세요.</h2><p>AI 요약은 학생이 공유를 허용하고 멤버십 권한이 확인된 경우에만 제공됩니다.</p></article></section></DashboardShell>;
}
