import { WebConnectionStatus } from "../../features/web-bridge/WebConnectionStatus";
import { ConnectionCard } from "../../features/web-bridge/ConnectionCard";
import { HistoryPage } from "../../features/extension-history/HistoryPage";
import { useState } from "react";
import { FocusPage } from "../../features/focus/FocusPage";
import { TabOrganizerCard } from "../../features/tab-organizer/TabOrganizerCard";
import { useApp } from "./AppContext";
import { BrandHeader } from "./components";
import { EXTENSION_NAV_ITEMS, openWebApp, type ExtensionPage } from "./extension-navigation";

function WebControlPanel() {
  return <section className="focus-page">
    <header className="page-heading">
      <h1 className="page-title">바로가기</h1>
      <p className="page-lead">계획과 기록, 계정 관리를 웹에서 이어가세요.</p>
    </header>
    <div className="stack">
      <ConnectionCard />
      <article className="card">
        <h2>웹 바로가기</h2>
        <div className="web-shortcuts">
          {[
            { path: "/focus", title: "집중 계획", description: "계획 작성과 집중 시작" },
            { path: "/history", title: "집중 기록", description: "성과와 리포트 확인" },
            { path: "/my", title: "마이페이지", description: "계정과 포인트 관리" },
          ].map((item) => <button key={item.path} onClick={() => openWebApp(item.path)}>
            <span><strong>{item.title}</strong><small>{item.description}</small></span>
            <span className="shortcut-arrow" aria-hidden="true">›</span>
          </button>)}
        </div>
      </article>
    </div>
  </section>;
}

function TabOrganizerPage() {
  const { snapshot } = useApp();
  return <section className="focus-page">
    <header className="page-heading">
      <h1 className="page-title">탭 정리</h1>
      <p className="page-lead">집중할 때 필요한 탭을 모으고 정리하세요.</p>
    </header>
    {snapshot.activeSession
      ? <TabOrganizerCard />
      : <article className="card"><h2>집중을 시작하면 탭을 정리할 수 있어요</h2><p>작업에 필요한 탭을 모으고, 정리 전 상태로 복원할 수 있습니다.</p><button className="button" onClick={() => openWebApp("/focus")}>집중 계획 열기</button></article>}
  </section>;
}

export function MainShell({ variant = "sidepanel" }: { variant?: "sidepanel" | "app" }) {
  const [page, setPage] = useState<ExtensionPage>("focus");
  const { actionError, dismissActionError } = useApp();

  return <div className={`app-shell ${variant === "app" ? "app-page" : "sidepanel-page"}`}>
    <BrandHeader subtitle="집중을 이어가는 브라우저 도우미" status={<WebConnectionStatus />} />
    <main className="content">
      {actionError && <div className="action-error-banner" role="alert"><span>{actionError}</span><button type="button" onClick={dismissActionError} aria-label="오류 메시지 닫기">닫기</button></div>}
      {page === "focus" && <FocusPage />}
      {page === "tabs" && <TabOrganizerPage />}
      {page === "history" && <HistoryPage />}
      {page === "web" && <WebControlPanel />}
    </main>
    <nav className="nav" aria-label="주 메뉴">
      {EXTENSION_NAV_ITEMS.map((item) => <button key={item.id} aria-current={page === item.id ? "page" : undefined} onClick={() => setPage(item.id)}>{item.label}</button>)}
    </nav>
  </div>;
}
