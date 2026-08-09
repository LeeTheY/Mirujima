import Link from "next/link";
import { Brand } from "@/components/brand";
import { parsePaymentCallback } from "@/features/membership/payment";
import { createClient } from "@/lib/supabase/server";

export default async function MembershipSuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  let title = "결제 승인 중 문제가 발생했습니다.";
  let description = "멤버십은 변경되지 않았습니다. 결제 페이지에서 다시 확인해 주세요.";
  try {
    const values = await searchParams;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (typeof value === "string") query.set(key, value);
    const supabase = await createClient();
    const { data, error } = await supabase.functions.invoke("membership-confirm-payment", { body: parsePaymentCallback(query) });
    if (error || data?.status !== "active") throw new Error("confirmation_failed");
    title = "Premium 1개월이 활성화되었습니다.";
    description = typeof data.currentPeriodEndsAt === "string"
      ? `${new Date(data.currentPeriodEndsAt).toLocaleString("ko-KR")}까지 사용할 수 있습니다.`
      : "확장 프로그램에서 멤버십 다시 확인을 눌러 새 권한을 불러오세요.";
  } catch { /* Provider details remain hidden behind safe copy. */ }
  return (
    <main className="payment-page">
      <header><Brand /></header>
      <section className="payment-card result-card">
        <div className="test-mode-banner">
          <strong>멤버십 승인</strong>
          <span>보안 결제 성공</span>
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="row flex gap-3 justify-center">
          <Link className="button" href="/my">마이페이지</Link>
          <Link className="button secondary" href="/membership/checkout">결제 다시 확인</Link>
        </div>
      </section>
    </main>
  );
}
