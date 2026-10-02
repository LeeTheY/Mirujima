import { redirect } from "next/navigation";
import { PaymentOverlay } from "@/components/payment-overlay";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { loadWalletRead } from "./wallet-data";
import { WalletUnavailable } from "./wallet-unavailable";
import { CashoutPanel } from "./cashout-panel";

export async function CashoutModal({ closeMode = "route" }: { closeMode?: "back" | "route" }) {
  const { role } = await requireAuthenticatedRole("/wallet/cashout");
  if (role !== "student") redirect("/guardian/my");
  const wallet = await loadWalletRead();

  return (
    <PaymentOverlay title="포인트 현금화 안내" returnHref="/my" closeMode={closeMode} wide>
      <CashoutPanel key={wallet.checkedAt} initialBalances={wallet.status === "ready" ? wallet.summary : null} />
      {wallet.status !== "ready" && <WalletUnavailable checkedAt={wallet.checkedAt} />}
    </PaymentOverlay>
  );
}
