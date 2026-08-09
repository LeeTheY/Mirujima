import Link from "next/link";
import { Brand } from "@/components/brand";
import { paymentFailureCopy } from "@/features/membership/payment";

export default async function MembershipFailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code : null;
  return (
    <main className="payment-page">
      <header><Brand /></header>
      <section className="payment-card result-card">
        <div className="test-mode-banner">
          <strong>결제 알림</strong>
          <span>승인 실패</span>
        </div>
        <h1>Premium 결제가 완료되지 않았습니다.</h1>
        <p>{paymentFailureCopy(code)}</p>
        <p className="muted text-xs text-muted">결제가 승인되지 않아 멤버십과 데이터는 변경되지 않았습니다.</p>
        <Link className="button mt-2" href="/membership/checkout">다시 시도하기</Link>
      </section>
    </main>
  );
}
