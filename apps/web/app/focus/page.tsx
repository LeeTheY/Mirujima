import { DashboardShell } from "@/components/dashboard-shell";
import { FocusPlanner } from "@/features/focus/focus-planner";

export default function FocusPage() {
  return (
    <DashboardShell role="student" activeHref="/focus">
      <div className="page-heading">
        <div>
          <p className="eyebrow">오늘의 집중</p>
          <h1>목표를 세우고 세션을 시작해보세요</h1>
        </div>
      </div>
      <FocusPlanner />
    </DashboardShell>
  );
}
