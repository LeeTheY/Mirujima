import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { parseTopupCallback } from "@/features/wallet/topup";
import { createClient } from "@/lib/supabase/server";
import { X } from "lucide-react";

export default async function ChargeSuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { role } = await requireAuthenticatedRole("/wallet/charge/success");
  const returnHref = role === "guardian" ? "/guardian/my" : "/my";
  let title = "포인트 충전을 완료하지 못했습니다.";
  let description = "포인트 잔액은 변경되지 않았습니다.";

  try {
    const values = await searchParams;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "string") query.set(key, value);
    }
    const input = parseTopupCallback(query);
    const { data, error } = await (await createClient()).functions.invoke("wallet-confirm-topup", { body: input });
    if (error || data?.status !== "confirmed") throw new Error();
    title = `${Number(data.points).toLocaleString()}P가 충전되었습니다.`;
    description = `사용 가능 충전 포인트: ${Number(data.balances?.topupAvailable ?? 0).toLocaleString()}P`;
  } catch {
    /* safe result */
  }

  return (
    <DashboardShell role={role} activeHref={returnHref}>
      <div className="modal-overlay payment-modal-overlay">
        <section
          aria-label="포인트 충전 결과"
          aria-modal="true"
          className="modal-content payment-modal-content"
          role="dialog"
          style={{ width: "min(100%, 480px)" }}
        >
          <header className="payment-modal-header">
            <h1>포인트 충전 결과</h1>
            <Link href={returnHref} className="icon-close-button" aria-label="닫기">
              <X className="w-4 h-4" />
            </Link>
          </header>
          <div className="payment-modal-body text-center">
            <div className="test-mode-banner mb-5 text-left">
              <strong>테스트 결제</strong>
              <span>실제 청구 없음</span>
            </div>

            <h2 className="text-2xl font-extrabold text-navy mb-2">{title}</h2>
            <p className="text-sm text-gray-600 mb-6">{description}</p>

            <Link className="button full" href={returnHref}>
              확인
            </Link>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
