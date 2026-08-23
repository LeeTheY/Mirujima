import Link from "next/link";
import { Brand } from "@/components/brand";
import { confirmationFailureCopy, parsePaymentCallback, readFunctionErrorCode } from "@/features/membership/payment";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedRole } from "@/features/auth/require-role";

export default async function MembershipSuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { role } = await requireAuthenticatedRole("/membership/success");
  const returnHref = role === "guardian" ? "/guardian/my" : "/my";
  let title = "결제 승인 중 문제가 발생했습니다.";
  let description = "멤버십은 변경되지 않았습니다. 결제 페이지에서 다시 확인해 주세요.";
  const values = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (typeof value === "string") query.set(key, value);
  try {
    const input = parsePaymentCallback(query);
    const supabase = await createClient();
    const { data, error } = await supabase.functions.invoke("membership-confirm-payment", { body: input });
    if (error) {
      description = confirmationFailureCopy("membership", await readFunctionErrorCode(error));
    } else if (data?.status === "active") {
      title = data.productCode === "guardian_family" ? "가족 Premium 30일이 활성화되었습니다." : "학생 Premium 30일이 활성화되었습니다.";
      description = typeof data.currentPeriodEndsAt === "string"
        ? `${new Date(data.currentPeriodEndsAt).toLocaleString("ko-KR")}까지 사용할 수 있습니다.`
        : "확장 프로그램에서 멤버십 다시 확인을 눌러 새 권한을 불러오세요.";
    }
  } catch {
    description = "결제 결과 주소가 올바르지 않습니다. 멤버십은 변경되지 않았습니다.";
  }
  return (
    <main className="payment-page">
      <header><Brand /></header>
      <section className="payment-card result-card">
        <div className="test-mode-banner">
          <strong>Toss 테스트 결제 승인</strong>
          <span>실제 청구 없음</span>
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="row flex gap-3 justify-center">
          <Link className="button" href={returnHref}>마이페이지</Link>
          <Link className="button secondary" href="/membership/checkout">결제 다시 확인</Link>
        </div>
      </section>
    </main>
  );
}
