import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { GuardianMyPage } from "@/features/profile/guardian-my-page";
import { loadOwnDisplayName } from "@/features/profile/profile-data";
import { loadGuardianLinkedStudents } from "@/features/family/linked-students-data";

export default async function GuardianMyRoute() {
  const { user } = await requireAuthenticatedRole("/guardian/my");
  const [displayName, linked] = await Promise.all([loadOwnDisplayName(user.id), loadGuardianLinkedStudents()]);
  return <GuardianMyPage displayName={displayName} students={linked.students} studentLoadFailed={linked.loadFailed} />;
}
