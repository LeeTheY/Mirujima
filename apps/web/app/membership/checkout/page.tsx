import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { MembershipCheckout } from "@/features/membership/checkout";
import { hasSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function MembershipCheckoutPage() {
  if (!hasSupabasePublicConfig()) return <main className="payment-page"><header><Brand /><Link href="/my">마이페이지로 돌아가기</Link></header><div className="notice"><strong>환경변수 설정 필요</strong><p>Supabase와 Toss 테스트 공개 키를 설정하면 결제 화면을 사용할 수 있습니다.</p></div></main>;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/onboarding");
  return <main className="payment-page"><header><Brand /><Link href="/my">마이페이지로 돌아가기</Link></header><MembershipCheckout userId={data.user.id} email={data.user.email ?? null} /></main>;
}
