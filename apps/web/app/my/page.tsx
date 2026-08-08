import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";

export default function MyPage() {
  return <DashboardShell role="student" activeHref="/my"><div className="page-heading"><div><p className="eyebrow">MY PAGE</p><h1>마이페이지</h1><p>계정과 집중 환경, 공유 범위를 관리합니다.</p></div></div><section className="settings-grid">{[["로그인 계정","Google 로그인 연결 후 계정 정보가 표시됩니다."],["멤버십","Premium 1개월 테스트 결제와 이용 기간을 관리합니다."],["학습 성과 요약","집중 기록이 쌓이면 주간 성과가 표시됩니다."],["연결 보호자 및 개인정보","6자리 코드로 연결하고 공유 범위를 직접 정합니다."],["포인트 현황","검증된 원장 거래만 잔액에 반영됩니다."],["공유 설정","AI 요약 공유는 기본적으로 꺼져 있습니다."]].map(([title,description]) => <article className="card" key={title}><span className="card-label">{title}</span><p>{description}</p>{title === "멤버십" ? <Link className="text-button" href="/membership/checkout">Premium 확인</Link> : title === "포인트 현황" ? <Link className="text-button" href="/wallet/cashout">현금화 샌드박스</Link> : <button className="text-button" type="button">설정 열기</button>}</article>)}</section></DashboardShell>;
}
