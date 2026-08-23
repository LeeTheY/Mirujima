import { DashboardShell } from "@/components/dashboard-shell";
import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { loadGuardianLinkedStudents } from "@/features/family/linked-students-data";
import { loadGuardianFocusHistory } from "@/features/history/history-data";
import { GuardianHistoryDashboard } from "@/features/history/guardian-history-dashboard";
import { normalizeHistoryQuery } from "@/features/history/history-query";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function scalar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GuardianHistoryPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAuthenticatedRole("/guardian/history");
  const params = await searchParams;
  const query = normalizeHistoryQuery({ period: scalar(params.period), date: scalar(params.date), student: scalar(params.student) });
  const linked = await loadGuardianLinkedStudents();
  const selected = linked.students.find((student) => student.studentUserId === query.studentId) ?? linked.students[0] ?? null;
  const result = selected ? await loadGuardianFocusHistory(selected.studentUserId, query.period, query.anchorDate) : { data: null, error: linked.loadFailed ? "연결 학생 목록을 불러오지 못했습니다. 연결 정보는 변경되지 않았습니다." : null };
  return <DashboardShell role="guardian" activeHref="/guardian/history"><GuardianHistoryDashboard students={linked.students} selectedStudentId={selected?.studentUserId ?? null} history={result.data} error={result.error} period={query.period} anchorDate={query.anchorDate} /></DashboardShell>;
}
