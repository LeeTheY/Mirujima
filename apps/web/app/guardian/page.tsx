import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { UserCheck, HeartHandshake, ChevronRight } from "lucide-react";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { loadGuardianLinkedStudents } from "@/features/family/linked-students-data";
import { LinkedStudentsList } from "@/features/family/linked-students-list";

import { GuardianHomeWalletCard } from "@/features/profile/guardian-home-wallet-card";

import { loadGuardianFocusHistory } from "@/features/history/history-data";
import { dateKeyInTimeZone } from "@/features/history/history-query";

export default async function GuardianHome({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  await requireAuthenticatedRole("/guardian");
  const linked = await loadGuardianLinkedStudents();
  const requested = (await searchParams).student;
  const selected = linked.students.find((student) => student.studentUserId === requested) ?? linked.students[0];
  const history = selected ? await loadGuardianFocusHistory(selected.studentUserId, "daily", dateKeyInTimeZone()) : null;
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
            <h2>{linked.loadFailed ? "연결 상태를 확인하지 못했습니다." : linked.students.length > 0 ? `${linked.students.length}명의 학생과 함께하고 있습니다.` : "연결된 학생이 없습니다."}</h2>
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
            {linked.loadFailed ? <p role="status">학생 목록을 다시 확인해야 기록을 표시할 수 있습니다.</p> : !selected ? <p>학생 연결 후 동의된 지표가 표시됩니다.</p> : <>
              <form action="/guardian" className="space-y-2">
                <label htmlFor="home-student">기록을 볼 학생</label>
                <select id="home-student" name="student" defaultValue={selected.studentUserId}>
                  {linked.students.map((student) => <option value={student.studentUserId} key={student.studentUserId}>{student.displayName}</option>)}
                </select>
                <button className="button secondary small" type="submit">학생 기록 확인</button>
              </form>
              {history?.error ? <p role="status">{history.error}</p> : history?.data ? <dl className="space-y-2 mt-3">
                <div><dt>기준 날짜</dt><dd>{history.data.range.startDate}</dd></div>
                <div><dt>완료 목표</dt><dd>{history.data.summary.completedGoalCount === null ? "공유하지 않는 항목" : `${history.data.summary.completedGoalCount}개`}</dd></div>
                <div><dt>집중 시간</dt><dd>{history.data.summary.totalFocusMinutes === null ? "공유하지 않는 항목" : `${history.data.summary.totalFocusMinutes}분`}</dd></div>
                <div><dt>지급 보상</dt><dd>{history.data.summary.rewardCount === null ? "공유하지 않는 항목" : `${history.data.summary.rewardCount}건`}</dd></div>
              </dl> : null}
              <Link className="text-button" href={`/guardian/history?student=${selected.studentUserId}`}>학생 전체 기록 보기</Link>
            </>}
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
