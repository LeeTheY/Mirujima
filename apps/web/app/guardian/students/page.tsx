import { DashboardShell } from "@/components/dashboard-shell";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { loadGuardianLinkedStudents } from "@/features/family/linked-students-data";
import { GuardianRewardRequests } from "@/features/family/guardian-reward-requests";

export default async function GuardianStudentsPage() {
  await requireAuthenticatedRole("/guardian/students");
  const linked = await loadGuardianLinkedStudents();
  return (
    <DashboardShell role="guardian" activeHref="/guardian/students">
      <div className="page-heading">
        <div>
          <p className="eyebrow">STUDENT LINK</p>
          <h1>학생 연결</h1>
          <p>연결된 학생과 보상 요청을 한곳에서 관리합니다.</p>
        </div>
      </div>
      <section className="guardian-student-grid"><GuardianRewardRequests students={linked.students} loadFailed={linked.loadFailed} /></section>
    </DashboardShell>
  );
}
