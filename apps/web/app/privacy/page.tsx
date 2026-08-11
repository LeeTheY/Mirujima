import Link from "next/link";
import { Brand } from "@/components/brand";

export default function PrivacyPage() {
  return <main className="public-detail"><header className="public-detail-header"><Brand /><Link href="/">홈으로</Link></header><section><p className="eyebrow">PRIVACY FIRST</p><h1>집중을 돕되, 감시하지 않습니다.</h1><p>보호자에게는 학생이 동의한 집계 정보만 제공합니다.</p></section><section className="public-detail-grid"><article className="card"><span className="card-label">수집·공유하지 않는 정보</span><h2>원본 활동 정보</h2><ul><li>전체 방문 URL과 검색어</li><li>폼 입력값과 페이지 본문</li><li>카메라 영상, 화면 캡처와 키 입력 원문</li></ul></article><article className="card"><span className="card-label">동의 시 공유하는 정보</span><h2>최소 집계 정보</h2><ul><li>목표 달성 여부와 완료 단계</li><li>총 집중 시간</li><li>획득·보상 상태</li><li>학생이 허용한 AI 요약</li></ul></article><article className="card"><span className="card-label">테스트 운영</span><h2>실제 결제·송금 없음</h2><p>현재 Toss 결제와 earned 포인트 현금화는 테스트 모드이며 실제 청구나 계좌 송금이 발생하지 않습니다.</p></article></section><Link className="button" href="/login">동의하고 시작하기</Link></main>;
}
