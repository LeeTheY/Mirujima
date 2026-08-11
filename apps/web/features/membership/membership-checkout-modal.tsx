import { PaymentOverlay } from "@/components/payment-overlay";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { MembershipCheckout } from "./checkout";

export async function MembershipCheckoutModal({
  closeMode = "route",
  orderKind = "membership",
}: {
  closeMode?: "back" | "route";
  orderKind?: "membership" | "family_seat";
}) {
  const { user, role } = await requireAuthenticatedRole("/membership/checkout");
  const returnHref = role === "guardian" ? "/guardian/my" : "/my";

  return (
    <PaymentOverlay title="멤버십 결제" returnHref={returnHref} closeMode={closeMode}>
      <MembershipCheckout userId={user.id} email={user.email ?? null} role={role} orderKind={orderKind} />
    </PaymentOverlay>
  );
}
