import { DashboardShell } from "@/components/dashboard-shell";
import { loadStudentFocusHistory, loadHistoryTimeZone } from "@/features/history/history-data";
import { normalizeHistoryQuery } from "@/features/history/history-query";
import { StudentHistoryDashboard } from "@/features/history/student-history-dashboard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function scalar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const timezone = await loadHistoryTimeZone();
  const query = normalizeHistoryQuery({ period: scalar(params.period), date: scalar(params.date) }, new Date(), timezone);
  const result = await loadStudentFocusHistory(query.period, query.anchorDate);
  return <DashboardShell role="student" activeHref="/history"><StudentHistoryDashboard history={result.data} error={result.error} period={query.period} anchorDate={query.anchorDate} /></DashboardShell>;
}
