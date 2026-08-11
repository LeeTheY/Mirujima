import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { UserCheck, ShieldCheck, HeartHandshake, CreditCard, ChevronRight } from "lucide-react";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { loadGuardianLinkedStudents } from "@/features/family/linked-students-data";
import { LinkedStudentsList } from "@/features/family/linked-students-list";

import { GuardianHomeWalletCard } from "@/features/profile/guardian-home-wallet-card";

export default async function GuardianHome() {
  await requireAuthenticatedRole("/guardian");
  const linked = await loadGuardianLinkedStudents();
  return (
    <DashboardShell role="guardian" activeHref="/guardian">
      <section className="dashboard-hero guardian">
        <div>
          <span className="hero-role-badge">가족 집중 모드</span>
          <h1>과정은 존중하고,<br />성취를 함께 응원하세요.</h1>
          <p>학생이 동의한 집중 결과만 안전하게 확인합니다.</p>
        </div>
        <Link className="button light shrink-0 flex items-center gap-2" href="/guardian/my">
          <UserCheck className="w-4 h-4 text-navy" />
          <span>연결 코드 입력하기</span>
        </Link>
      </section>

      <section className="dashboard-grid">
        <article className="card wide">
          <div>
            <span className="card-label mb-2">연결 학생</span>
            <h2>{linked.students.length > 0 ? `${linked.students.length}명의 학생과 함께하고 있습니다.` : "연결된 학생이 없습니다."}</h2>
            <LinkedStudentsList students={linked.students} loadFailed={linked.loadFailed} />
          </div>
          <div className="mt-4">
            <Link className="button secondary inline-flex items-center gap-2" href="/guardian/my">
              <span>연결 코드 입력하기</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </article>

        <article className="card">
          <div>
            <span className="card-label mb-2">학생 집중 지표</span>
            <div className="py-8 text-center text-muted text-sm">
              학생 연결 후 동의된 지표가 표시됩니다.
            </div>
          </div>
        </article>

        <GuardianHomeWalletCard />

        <article className="card wide">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <HeartHandshake className="w-4 h-4 text-blue-600" />
              <span className="card-label m-0">가족 협력 가이드</span>
            </div>
            <h2>결과보다 시작한 과정을 물어보세요.</h2>
            <p className="m-0">AI 요약은 학생이 공유를 허용하고 멤버십 권한이 확인된 경우에만 제공됩니다.</p>
          </div>
        </article>
      </section>
    </DashboardShell>
  );
}
