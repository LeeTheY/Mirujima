import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { CashoutPanel } from "@/features/wallet/cashout-panel";
import { hasSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function CashoutPage() {
  if (!hasSupabasePublicConfig()) return <DashboardShell role="student" activeHref="/my"><div className="notice"><strong>환경변수 설정 필요</strong><p>Supabase 공개 환경변수를 설정하면 현금화 샌드박스를 사용할 수 있습니다.</p></div></DashboardShell>;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/onboarding");
  const { data } = await supabase.functions.invoke("wallet-summary", { body: {} });
  const initialBalances = {
    earnedAvailable: Number.isSafeInteger(data?.earnedAvailable) ? data.earnedAvailable : 0,
    cashoutReserved: Number.isSafeInteger(data?.cashoutReserved) ? data.cashoutReserved : 0,
    cashoutCompleted: Number.isSafeInteger(data?.cashoutCompleted) ? data.cashoutCompleted : 0
  };
  return <DashboardShell role="student" activeHref="/my"><div className="page-heading"><div><p className="eyebrow">WALLET · TEST MODE</p><h1>포인트 현금화</h1><p>실제 송금 없이 earned 포인트의 처리 흐름을 확인합니다.</p></div><Link className="text-button" href="/my">마이페이지로 돌아가기</Link></div><CashoutPanel initialBalances={initialBalances} /></DashboardShell>;
}
