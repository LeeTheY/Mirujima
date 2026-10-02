import { MembershipCheckoutModal } from "@/features/membership/membership-checkout-modal";
import { hasSupabasePublicConfig } from "@/lib/supabase/config";

export default async function MembershipCheckoutPage({ searchParams }: { searchParams: Promise<{ orderKind?: string }> }) {
  if (!hasSupabasePublicConfig()) {
    return <main className="payment-page"><div className="notice"><strong>결제 서비스를 준비 중입니다.</strong><p>잠시 후 다시 시도해 주세요.</p></div></main>;
  }
  const orderKind = (await searchParams).orderKind === "family_seat" ? "family_seat" : "membership";
  return <main className="payment-page"><MembershipCheckoutModal orderKind={orderKind} /></main>;
}
