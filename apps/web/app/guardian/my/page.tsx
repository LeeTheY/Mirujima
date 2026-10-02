import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { GuardianMyPage } from "@/features/profile/guardian-my-page";
import { loadOwnDisplayName } from "@/features/profile/profile-data";
import { loadGuardianLinkedStudents } from "@/features/family/linked-students-data";
import { loadMembershipStatus } from "@/features/membership/membership-data";
import { loadGuardianPendingRewardCount } from "@/features/profile/study-summary-data";
import { loadWalletRead } from "@/features/wallet/wallet-data";

export default async function GuardianMyRoute() {
  const { user } = await requireAuthenticatedRole("/guardian/my");
  const [displayName, linked, membershipStatus, walletRead, pendingRewardCount] = await Promise.all([
    loadOwnDisplayName(user.id),
    loadGuardianLinkedStudents(),
    loadMembershipStatus(user.id),
    loadWalletRead(),
    loadGuardianPendingRewardCount(),
  ]);
  return <GuardianMyPage displayName={displayName} students={linked.students} studentLoadFailed={linked.loadFailed} membershipStatus={membershipStatus} walletSummary={walletRead.status === "ready" ? walletRead.summary : null} walletCheckedAt={walletRead.checkedAt} pendingRewardCount={pendingRewardCount} />;
}
