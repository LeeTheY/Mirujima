import type { ReactNode } from "react";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { loadOwnDisplayName } from "@/features/profile/profile-data";
import { ProfileDisplayNameProvider } from "@/features/profile/profile-display-provider";
import { loadStudentHasActiveGuardian } from "@/features/family/student-link-data";
import { loadMembershipStatus } from "@/features/membership/membership-data";
import { loadWalletSummary } from "@/features/wallet/wallet-data";

export default async function StudentMyLayout({ children }: { children: ReactNode }) {
  const { user } = await requireAuthenticatedRole("/my");
  const [displayName, hasActiveGuardian, membershipStatus, walletSummary] = await Promise.all([
    loadOwnDisplayName(user.id),
    loadStudentHasActiveGuardian(user.id),
    loadMembershipStatus(user.id),
    loadWalletSummary(),
  ]);
  return <ProfileDisplayNameProvider displayName={displayName} hasActiveGuardian={hasActiveGuardian} membershipStatus={membershipStatus} walletSummary={walletSummary}>{children}</ProfileDisplayNameProvider>;
}
