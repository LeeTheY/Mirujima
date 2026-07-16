import { useApp } from "./AppContext";
import { Onboarding } from "../../features/onboarding/Onboarding";
import { MainShell } from "./MainShell";
import { PopupApp } from "../../popup/PopupApp";

export function Root({ variant }: { variant: "sidepanel" | "popup" | "app" }) {
  const { snapshot, loading, error, refresh, dismissError } = useApp();
  if (loading) return <main className="onboarding"><p>미루지마를 준비하고 있어요…</p></main>;
  if (error) return <main className="onboarding error-screen">
    <span className="eyebrow">페이지를 불러오지 못했어요</span>
    <h1>잠시 문제가 생겼습니다.</h1>
    <div className="alert error" role="alert">{error}</div>
    <div className="row fatal-error-actions">
      <button className="button" onClick={() => void refresh()}>다시 시도</button>
      <button className="button ghost" onClick={() => { dismissError(); if (history.length > 1) history.back(); }}>이전 화면으로</button>
    </div>
  </main>;
  if (!snapshot.settings.onboardingCompleted) return <Onboarding />;
  return variant === "popup" ? <PopupApp /> : <MainShell variant={variant} />;
}
