import { useState } from "react";
import { BrandHeader } from "./components";
import { TodayPage } from "../../features/dashboard/TodayPage";
import { PlanPage } from "../../features/schedules/PlanPage";
import { FocusPage } from "../../features/focus/FocusPage";
import { ReportsPage } from "../../features/reports/ReportsPage";
import { SettingsPage } from "../../features/settings/SettingsPage";
import { HelpPage } from "../../features/help/HelpPage";
import { useApp } from "./AppContext";
import { WritingAssistantPage } from "../../features/writing-assistant/WritingAssistantPage";

type Page = "today" | "plan" | "focus" | "reports" | "settings" | "help" | "writing";
const ITEMS: { id: Page; label: string }[] = [
  { id: "today", label: "오늘" }, { id: "plan", label: "계획" }, { id: "focus", label: "집중" },
  { id: "reports", label: "리포트" }, { id: "settings", label: "설정" }, { id: "help", label: "도움말" }
];

export function MainShell({ variant = "sidepanel" }: { variant?: "sidepanel" | "app" }) {
  const [page, setPage] = useState<Page>("today");
  const { actionError, dismissActionError } = useApp();
  return <div className={`app-shell ${variant === "app" ? "app-page" : "sidepanel-page"}`}><BrandHeader /><main className="content">{variant === "sidepanel" && page !== "writing" && <div className="premium-tool-row"><button className="button secondary" onClick={() => setPage("writing")}>화면 AI 도구 <span className="badge">Premium</span></button></div>}{actionError && <div className="action-error-banner" role="alert"><span>{actionError}</span><button type="button" onClick={dismissActionError} aria-label="오류 메시지 닫기">닫기</button></div>}{page === "today" && <TodayPage goFocus={() => setPage("focus")} goPlan={() => setPage("plan")} />}{page === "plan" && <PlanPage />}{page === "focus" && <FocusPage />}{page === "reports" && <ReportsPage />}{page === "settings" && <SettingsPage />}{page === "help" && <HelpPage />}{page === "writing" && <WritingAssistantPage onClose={() => setPage("today")} />}</main><nav className="nav" aria-label="주 메뉴">{ITEMS.map((item) => <button key={item.id} aria-current={page === item.id ? "page" : undefined} onClick={() => setPage(item.id)}>{item.label}</button>)}</nav></div>;
}
