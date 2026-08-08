import { DashboardShell } from "@/components/dashboard-shell";
import { FocusPlanner } from "@/features/focus/focus-planner";

export default function FocusPage() {
  return <DashboardShell role="student" activeHref="/focus"><div className="page-heading"><div><p className="eyebrow">FOCUS PLAN</p><h1>집중 계획</h1><p>할 일과 방해 요소를 미리 정해 집중할 환경을 만드세요.</p></div><button className="button secondary" type="button">AI 스마트 추천</button></div><FocusPlanner /></DashboardShell>;
}
