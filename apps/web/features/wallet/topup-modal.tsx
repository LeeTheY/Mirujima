import { PaymentOverlay } from "@/components/payment-overlay";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { TopupPanel } from "./topup-panel";

export async function TopupModal({
  closeMode = "route",
}: {
  closeMode?: "back" | "route";
}) {
  const { user, role } = await requireAuthenticatedRole("/wallet/charge");
  const returnHref = role === "guardian" ? "/guardian/my" : "/my";

  return (
    <PaymentOverlay title="포인트 충전" returnHref={returnHref} closeMode={closeMode}>
      <TopupPanel userId={user.id} email={user.email ?? null} />
    </PaymentOverlay>
  );
}
