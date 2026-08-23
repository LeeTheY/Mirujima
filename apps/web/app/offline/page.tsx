import Link from "next/link";
import { WifiOff } from "lucide-react";
import { Brand } from "@/components/brand";

export default function OfflinePage() {
  return <main className="payment-page">
    <header><Brand /></header>
    <section className="payment-card result-card" aria-labelledby="offline-title">
      <WifiOff className="w-10 h-10 text-blue-600 mx-auto" aria-hidden="true" />
      <p className="eyebrow">OFFLINE</p>
      <h1 id="offline-title">인터넷 연결을 확인해 주세요.</h1>
      <p>공개 안내 화면은 오프라인에서도 볼 수 있지만, 로그인·집중 상태 변경·가족 연결·포인트·결제·AI 기능은 연결이 필요합니다.</p>
      <div className="notice"><strong>진행 중인 집중은 안전합니다.</strong><p>이미 시작한 집중 타이머와 사이트 차단은 Chrome 확장 프로그램에서 계속 유지됩니다.</p></div>
      <Link className="button full" href="/">공개 홈으로 이동</Link>
    </section>
  </main>;
}
