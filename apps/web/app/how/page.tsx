import Link from "next/link";
import { Brand } from "@/components/brand";

const steps = [
  ["01", "웹에서 계획 만들기", "할 일, 집중 시간과 차단할 사이트를 정하고 집중 준비를 완료합니다."],
  ["02", "확장 프로그램으로 실행하기", "Chrome 확장 프로그램이 서버의 계획을 다시 확인한 뒤 타이머와 사이트 차단을 실행합니다."],
  ["03", "안전하게 동기화하기", "Supabase가 세션과 결과의 기준 데이터를 보관하고 웹과 확장 프로그램을 동기화합니다."],
];

export default function HowPage() {
  return <main className="public-detail"><header className="public-detail-header"><Brand /><Link href="/">홈으로</Link></header><section><p className="eyebrow">HOW IT WORKS</p><h1>계획을 실제 집중 환경으로 연결합니다.</h1><p>웹은 계획을 관리하고, 확장 프로그램은 브라우저에서 집중 환경을 유지하며, 서버는 신뢰할 수 있는 상태를 보관합니다.</p></section><section className="public-detail-grid">{steps.map(([number, title, description]) => <article className="card" key={number}><span className="card-label">{number}</span><h2>{title}</h2><p>{description}</p></article>)}</section><Link className="button" href="/onboarding">시작하기</Link></main>;
}
