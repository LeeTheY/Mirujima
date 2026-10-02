import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { CashoutPanel } from "@/features/wallet/cashout-panel";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { loadWalletRead } from "@/features/wallet/wallet-data";
import { WalletUnavailable } from "@/features/wallet/wallet-unavailable";
import { ChevronRight } from "lucide-react";

export default async function CashoutPage() {
  const { role } = await requireAuthenticatedRole("/wallet/cashout");
  if (role !== "student") redirect("/guardian/my");
  const wallet = await loadWalletRead();

  return (
    <DashboardShell role="student" activeHref="/my">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WALLET & REWARDS</p>
          <h1>포인트 현금화</h1>
          <p>획득 포인트와 기존 정산 기록을 확인하세요. 현금화 서비스는 준비 중입니다.</p>
        </div>
        <Link className="text-button flex items-center gap-1" href="/my">
          <span>마이페이지로 돌아가기</span>
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <CashoutPanel initialBalances={wallet.status === "ready" ? wallet.summary : null} />
      {wallet.status !== "ready" && <WalletUnavailable checkedAt={wallet.checkedAt} />}
    </DashboardShell>
  );
}
