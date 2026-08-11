import { PaymentOverlay } from "@/components/payment-overlay";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { RefundPanel } from "./refund-panel";

export async function RefundModal({ closeMode = "route" }: { closeMode?: "back" | "route" }) {
  await requireAuthenticatedRole("/wallet/refund");
  const supabase = await createClient();
  const { data } = await supabase.functions.invoke("wallet-summary", { body: {} });
  const topupAvailable = Number.isSafeInteger(data?.topupAvailable) ? data.topupAvailable : 0;
  return (
    <PaymentOverlay title="충전 포인트 환불 신청" returnHref="/guardian/my" closeMode={closeMode}>
      <RefundPanel initialTopupAvailable={topupAvailable} />
    </PaymentOverlay>
  );
}
