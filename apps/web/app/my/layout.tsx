import type { ReactNode } from "react";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { loadOwnDisplayName } from "@/features/profile/profile-data";
import { ProfileDisplayNameProvider } from "@/features/profile/profile-display-provider";

export default async function StudentMyLayout({ children }: { children: ReactNode }) {
  const { user } = await requireAuthenticatedRole("/my");
  const displayName = await loadOwnDisplayName(user.id);
  return <ProfileDisplayNameProvider displayName={displayName}>{children}</ProfileDisplayNameProvider>;
}
