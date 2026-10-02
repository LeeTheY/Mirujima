import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { parseTopupCallback } from "@/features/wallet/topup";
import { confirmationFailureCopy, readFunctionErrorCode } from "@/features/membership/payment";
import { createClient } from "@/lib/supabase/server";
import { X } from "lucide-react";
import { topupConfirmationCopy } from "@/features/wallet/topup-confirmation";

export default async function ChargeSuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { role } = await requireAuthenticatedRole("/wallet/charge/success");
  const returnHref = role === "guardian" ? "/guardian/my" : "/my";
  let title = "충전 결과 확인이 필요합니다.";
  let description = "충전 내역과 잔액을 다시 확인해 주세요.";

  try {
    const values = await searchParams;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "string") query.set(key, value);
    }
    const input = parseTopupCallback(query);
    const { data, error } = await (await createClient()).functions.invoke("wallet-confirm-topup", { body: input });
    if (error) {
      description = confirmationFailureCopy("topup", await readFunctionErrorCode(error));
    } else {
      ({ title, description } = topupConfirmationCopy(data, input.amount));
    }
  } catch {
    description = "결제 결과 주소 또는 서버 응답을 확인하지 못했습니다. 충전 내역과 잔액을 다시 확인해 주세요.";
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
              <strong>포인트 충전 결과</strong>
              <span>서버에서 확인한 승인 결과를 안내합니다.</span>
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
