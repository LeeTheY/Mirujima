import { PaymentOverlay } from "@/components/payment-overlay";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { CashoutPanel } from "./cashout-panel";

export async function CashoutModal({ closeMode = "route" }: { closeMode?: "back" | "route" }) {
  await requireAuthenticatedRole("/wallet/cashout");
  const supabase = await createClient();
  const { data } = await supabase.functions.invoke("wallet-summary", { body: {} });
  const initialBalances = {
    earnedAvailable: Number.isSafeInteger(data?.earnedAvailable) ? data.earnedAvailable : 0,
    cashoutReserved: Number.isSafeInteger(data?.cashoutReserved) ? data.cashoutReserved : 0,
    cashoutCompleted: Number.isSafeInteger(data?.cashoutCompleted) ? data.cashoutCompleted : 0,
  };

  return (
    <PaymentOverlay title="포인트 환급 신청" returnHref="/my" closeMode={closeMode} wide>
      <CashoutPanel initialBalances={initialBalances} />
    </PaymentOverlay>
  );
}
