import { PaymentOverlay } from "@/components/payment-overlay";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { loadWalletRead } from "./wallet-data";
import { WalletUnavailable } from "./wallet-unavailable";
import { RefundPanel } from "./refund-panel";

export async function RefundModal({ closeMode = "route" }: { closeMode?: "back" | "route" }) {
  const { user } = await requireAuthenticatedRole("/wallet/refund");
  const wallet = await loadWalletRead();
  return (
    <PaymentOverlay title="충전 포인트 환불 신청" returnHref="/guardian/my" closeMode={closeMode}>
      {wallet.status === "ready" && wallet.maxRefundableTopup !== null ? <RefundPanel userId={user.id} key={wallet.checkedAt} initialTopupAvailable={wallet.summary.topupAvailable} initialMaxRefundableTopup={wallet.maxRefundableTopup} /> : <WalletUnavailable checkedAt={wallet.checkedAt} />}
    </PaymentOverlay>
  );
}
