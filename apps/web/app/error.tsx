"use client";
import Link from "next/link";
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <section className="card route-state" role="alert"><h1>화면을 불러오지 못했습니다.</h1><p>다시 시도해 최신 상태를 확인해 주세요. 결제 중이었다면 같은 주문의 결과를 먼저 확인하세요.</p>{error.digest ? <p>문의 번호: {error.digest}</p> : null}<div className="flex gap-3 flex-wrap"><button className="button" onClick={retry}>다시 시도</button><Link className="button secondary" href="/">홈으로</Link></div></section>;
}
