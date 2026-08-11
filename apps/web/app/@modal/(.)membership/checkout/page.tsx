import { MembershipCheckoutModal } from "@/features/membership/membership-checkout-modal";

export default async function InterceptedMembershipCheckoutPage({ searchParams }: { searchParams: Promise<{ orderKind?: string }> }) {
  const orderKind = (await searchParams).orderKind === "family_seat" ? "family_seat" : "membership";
  return <MembershipCheckoutModal closeMode="back" orderKind={orderKind} />;
}
