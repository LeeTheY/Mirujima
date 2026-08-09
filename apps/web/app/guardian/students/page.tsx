import { DashboardShell } from "@/components/dashboard-shell";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { loadGuardianLinkedStudents } from "@/features/family/linked-students-data";
import { LinkedStudentsList } from "@/features/family/linked-students-list";

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
      <section className="dashboard-grid guardian-student-grid">
        <article className="card linked-list"><span className="card-label">연결된 학생 목록</span><LinkedStudentsList students={linked.students} loadFailed={linked.loadFailed} /></article>
        <article className="card wide"><span className="card-label">보상 요청 관리</span><h2>대기 중인 보상 요청이 없습니다.</h2><p>연결 학생이 보상을 요청하면 학생 이름과 함께 이곳에 표시됩니다.</p></article>
      </section>
    </DashboardShell>
  );
}
