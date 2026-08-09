import Link from "next/link";
import { Brand } from "@/components/brand";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { TopupPanel } from "@/features/wallet/topup-panel";

export default async function ChargePage() {
  const { user, role } = await requireAuthenticatedRole("/wallet/charge");
  return <main className="payment-page"><header><Brand /><Link href={role === "guardian" ? "/guardian/my" : "/my"}>내 지갑으로 돌아가기</Link></header><TopupPanel userId={user.id} email={user.email ?? null} /></main>;
}
