import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { topupFailureCopy } from "@/features/wallet/topup";
import { X } from "lucide-react";

export default async function TopupFailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { role } = await requireAuthenticatedRole("/wallet/charge/fail");
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code : "";
  const returnHref = role === "guardian" ? "/guardian/my" : "/my";

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
              <strong>결제 알림</strong>
              <span>포인트 미충전</span>
            </div>

            <h2 className="text-xl font-extrabold text-navy mb-2">포인트가 충전되지 않았습니다.</h2>
            <p className="text-sm text-gray-600 mb-6">{topupFailureCopy(code)}</p>

            <div className="flex gap-3">
              <Link className="button secondary full" href={returnHref}>
                닫기
              </Link>
              <Link className="button full" href="/wallet/charge">
                다시 시도
              </Link>
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
