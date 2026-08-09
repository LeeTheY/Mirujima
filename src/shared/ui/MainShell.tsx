import { useState } from "react";
import { FocusPage } from "../../features/focus/FocusPage";
import { TabOrganizerCard } from "../../features/tab-organizer/TabOrganizerCard";
import { useApp } from "./AppContext";
import { BrandHeader } from "./components";
import { EXTENSION_NAV_ITEMS, openWebApp, type ExtensionPage } from "./extension-navigation";

function WebControlPanel() {
  return <section className="focus-page">
    <header className="page-heading">
      <h1 className="page-title">Mirujima Web</h1>
      <p className="page-lead">계획, 기록, 계정과 포인트 관리는 Web에서 이어서 이용하세요.</p>
    </header>
    <div className="stack">
      <article className="card">
        <span className="eyebrow">CONTROL PLANE</span>
        <h2>Web에서 관리하기</h2>
        <p>확장 프로그램은 진행 중인 집중과 Chrome 사이트 차단을 계속 담당합니다.</p>
        <div className="row">
          <button className="button" onClick={() => openWebApp("/focus")}>집중 계획</button>
          <button className="button secondary" onClick={() => openWebApp("/history")}>기록</button>
          <button className="button ghost" onClick={() => openWebApp("/my")}>마이페이지</button>
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
      <p className="page-lead">Chrome에서만 가능한 현재 창 탭 그룹화와 복원을 관리합니다.</p>
    </header>
    {snapshot.activeSession
      ? <TabOrganizerCard />
      : <article className="card"><h2>진행 중인 집중이 없습니다.</h2><p>Web에서 집중을 시작하면 현재 일정 기준으로 탭을 정리할 수 있습니다.</p><button className="button" onClick={() => openWebApp("/focus")}>Web에서 집중 준비</button></article>}
  </section>;
}

export function MainShell({ variant = "sidepanel" }: { variant?: "sidepanel" | "app" }) {
  const [page, setPage] = useState<ExtensionPage>("focus");
  const { actionError, dismissActionError } = useApp();

  return <div className={`app-shell ${variant === "app" ? "app-page" : "sidepanel-page"}`}>
    <BrandHeader subtitle="브라우저 집중 실행 에이전트" />
    <main className="content">
      {actionError && <div className="action-error-banner" role="alert"><span>{actionError}</span><button type="button" onClick={dismissActionError} aria-label="오류 메시지 닫기">닫기</button></div>}
      {page === "focus" && <FocusPage />}
      {page === "tabs" && <TabOrganizerPage />}
      {page === "web" && <WebControlPanel />}
    </main>
    <nav className="nav" aria-label="주 메뉴">
      {EXTENSION_NAV_ITEMS.map((item) => <button key={item.id} aria-current={page === item.id ? "page" : undefined} onClick={() => setPage(item.id)}>{item.label}</button>)}
    </nav>
  </div>;
}
