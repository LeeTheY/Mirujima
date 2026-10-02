import { z } from "zod";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { WalletHistoryPanel } from "@/features/wallet/wallet-history-panel";

export default async function WalletHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, role } = await requireAuthenticatedRole("/wallet/history");
  const params = await searchParams;
  const transaction = params.transaction;
  const valid = transaction === undefined || (typeof transaction === "string" && z.uuid().safeParse(transaction).success);
  const back = role === "guardian" ? "/guardian/my" : "/my";
  return <DashboardShell role={role} activeHref={back}>
    <div className="page-heading"><div><p className="eyebrow">WALLET HISTORY</p><h1>포인트 거래 내역</h1><p>충전·집중·보상·지급의 흐름을 원장으로 확인하세요.</p></div><Link className="button secondary" href={back}>내 지갑으로</Link></div>
    {valid ? <WalletHistoryPanel key={typeof transaction === "string" ? transaction : "all"} ownerId={user.id} role={role} transactionId={typeof transaction === "string" ? transaction : null} /> : <div className="notice error" role="alert"><p>거래 주소가 올바르지 않습니다.</p><Link href="/wallet/history">전체 거래 내역 열기</Link></div>}
  </DashboardShell>;
}
