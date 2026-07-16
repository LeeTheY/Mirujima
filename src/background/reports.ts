import { createDailyReport } from "../features/reports/report";
import { repository } from "../shared/storage/repository";
import { dateKeyDaysAgo, toDateKey } from "../shared/time/time";

export async function generateReport(dateKey: string): Promise<void> {
  const [schedules, sessions, events, reports] = await Promise.all([
    repository.getSchedules(),
    repository.getSessionHistory(),
    repository.getEvents(),
    repository.getReports()
  ]);
  const existing = reports.find((item) => item.dateKey === dateKey);
  const report = createDailyReport(dateKey, schedules, sessions, events, existing);
  await repository.setReports([...reports.filter((item) => item.dateKey !== dateKey), report]
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey)).slice(0, 30));
}

export async function generateMissedReports(): Promise<void> {
  const settings = await repository.getSettings();
  if (!settings.dailyReportEnabled) return;
  const schedules = await repository.getSchedules();
  const today = toDateKey();
  const dates = new Set(schedules.map((item) => item.dateKey).filter((key) => key < today && key >= dateKeyDaysAgo(30)));
  await Promise.all([...dates].map(generateReport));
}
