import Link from "next/link";
import { Brand } from "@/components/brand";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { parseTopupCallback } from "@/features/wallet/topup";
import { createClient } from "@/lib/supabase/server";

export default async function ChargeSuccessPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const { role } = await requireAuthenticatedRole("/wallet/charge/success"); let title="포인트 충전을 완료하지 못했습니다."; let description="포인트 잔액은 변경되지 않았습니다.";
  try { const values=await searchParams; const query=new URLSearchParams(); for(const [key,value] of Object.entries(values)) if(typeof value==="string") query.set(key,value); const input=parseTopupCallback(query); const { data,error }=await (await createClient()).functions.invoke("wallet-confirm-topup",{body:input}); if(error||data?.status!=="confirmed") throw new Error(); title=`${Number(data.points).toLocaleString()}P가 충전되었습니다.`; description=`사용 가능 충전 포인트: ${Number(data.balances?.topupAvailable??0).toLocaleString()}P`; } catch { /* safe result */ }
  return <main className="payment-page"><header><Brand /></header><section className="payment-card result-card"><div className="test-mode-banner"><strong>테스트 결제</strong><span>실제 청구 없음</span></div><h1>{title}</h1><p>{description}</p><Link className="button" href={role === "guardian" ? "/guardian/my" : "/my"}>마이페이지</Link></section></main>;
}
