import { MembershipCheckoutModal } from "@/features/membership/membership-checkout-modal";
import { hasSupabasePublicConfig } from "@/lib/supabase/config";

export default async function MembershipCheckoutPage({ searchParams }: { searchParams: Promise<{ orderKind?: string }> }) {
  if (!hasSupabasePublicConfig()) {
    return <main className="payment-page"><div className="notice"><strong>환경변수 설정 필요</strong><p>Supabase와 Toss 테스트 공개 키를 설정하면 Google 로그인 후 결제 화면을 사용할 수 있습니다.</p></div></main>;
  }
  const orderKind = (await searchParams).orderKind === "family_seat" ? "family_seat" : "membership";
  return <main className="payment-page"><MembershipCheckoutModal orderKind={orderKind} /></main>;
}
