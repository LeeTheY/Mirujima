import { PaymentOverlay } from "@/components/payment-overlay";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { loadGuardianLinkedStudents } from "./linked-students-data";
import { GuardianRewardRequests } from "./guardian-reward-requests";

export async function GuardianRewardRequestsModal({ closeMode = "route" }: { closeMode?: "back" | "route" }) {
  await requireAuthenticatedRole("/guardian/rewards");
  const linked = await loadGuardianLinkedStudents();
  return (
    <PaymentOverlay title="보상 요청 확인" returnHref="/guardian/my" closeMode={closeMode}>
      <GuardianRewardRequests students={linked.students} loadFailed={linked.loadFailed} />
    </PaymentOverlay>
  );
}
