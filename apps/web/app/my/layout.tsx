import type { ReactNode } from "react";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { loadOwnDisplayName } from "@/features/profile/profile-data";
import { ProfileDisplayNameProvider } from "@/features/profile/profile-display-provider";
import { loadStudentHasActiveGuardian } from "@/features/family/student-link-data";
import { loadMembershipStatus } from "@/features/membership/membership-data";
import { loadWalletRead } from "@/features/wallet/wallet-data";
import { loadOwnMonthlyStudySummary } from "@/features/profile/study-summary-data";
import { loadOwnSharingPreferences } from "@/features/family/sharing-data";

export default async function StudentMyLayout({ children }: { children: ReactNode }) {
  const { user } = await requireAuthenticatedRole("/my");
  const [displayName, hasActiveGuardian, membershipStatus, walletRead, sharingPreferences, studySummary] = await Promise.all([
    loadOwnDisplayName(user.id),
    loadStudentHasActiveGuardian(user.id),
    loadMembershipStatus(user.id),
    loadWalletRead(),
    loadOwnSharingPreferences(user.id),
    loadOwnMonthlyStudySummary(user.id),
  ]);
  return <ProfileDisplayNameProvider displayName={displayName} hasActiveGuardian={hasActiveGuardian} membershipStatus={membershipStatus} walletSummary={walletRead.status === "ready" ? walletRead.summary : null} walletCheckedAt={walletRead.checkedAt} sharingPreferences={sharingPreferences} studySummary={studySummary}>{children}</ProfileDisplayNameProvider>;
}
