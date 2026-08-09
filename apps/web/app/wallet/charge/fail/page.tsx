import Link from "next/link";
import { Brand } from "@/components/brand";
import { topupFailureCopy } from "@/features/wallet/topup";

export default async function TopupFailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code : "";

  return (
    <main className="payment-page">
      <header>
        <Brand />
      </header>
      <section className="payment-card result-card">
        <div className="test-mode-banner">
          <strong>결제 알림</strong>
          <span>포인트 미충전</span>
        </div>
        <h1>포인트가 충전되지 않았습니다.</h1>
        <p>{topupFailureCopy(code)}</p>
        <Link className="button mt-2" href="/wallet/charge">
          다시 시도하기
        </Link>
      </section>
    </main>
  );
}
