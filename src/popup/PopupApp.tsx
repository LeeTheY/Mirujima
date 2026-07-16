import { useEffect, useState } from "react";
import { openExtensionPage, sendMessage } from "../shared/chrome/messaging";
import { useApp } from "../shared/ui/AppContext";
import { BrandHeader, ProgressBar } from "../shared/ui/components";
import { elapsedBreakSeconds, elapsedFocusSeconds, formatClock, getBreakTimeState, toDateKey } from "../shared/time/time";
import { useNow } from "../shared/time/useNow";

export function PopupApp() {
  const { snapshot, run, actionError, dismissActionError } = useApp();
  const now = useNow();
  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);
  const [sidePanelError, setSidePanelError] = useState<string | null>(null);
  const [organizingTabs, setOrganizingTabs] = useState(false);
  const startFocus = (scheduleId: string) => {
    const shouldOrganize = snapshot.tabOrganizerSettings.enabled
      && snapshot.tabOrganizerSettings.organizeOnFocusStart
      && window.confirm("집중을 시작하기 전에 현재 창의 탭을 그룹화할까요?\n취소를 눌러도 집중은 그대로 시작합니다.");
    void run({ type: "FOCUS_START", scheduleId, organizeTabs: shouldOrganize });
  };
  useEffect(() => {
    void chrome.windows.getCurrent().then((currentWindow) => setCurrentWindowId(currentWindow.id ?? null));
  }, []);
  const openSidePanel = () => {
    if (currentWindowId === null) {
      setSidePanelError("현재 Chrome 창을 확인하고 있어요. 잠시 후 다시 눌러주세요.");
      return;
    }
    setSidePanelError(null);
    void chrome.sidePanel.open({ windowId: currentWindowId })
      .then(() => window.close())
      .catch((cause: unknown) => setSidePanelError(cause instanceof Error ? cause.message : "Side Panel을 열지 못했습니다."));
  };
  const today = snapshot.schedules.filter((item) => item.dateKey === toDateKey());
  const completed = today.filter((item) => item.status === "completed").length;
  const rate = today.length ? Math.round(completed / today.length * 100) : 0;
  const session = snapshot.activeSession;
  const current = session ? snapshot.schedules.find((item) => item.id === session.scheduleId) : undefined;
  const elapsed = current && session ? elapsedFocusSeconds(session.startedAt, session.pausedAt, session.accumulatedFocusSeconds, now) : 0;
  const timeEnded = Boolean(current && session && (session.status === "awaiting-result" || elapsed >= current.targetFocusMinutes * 60));
  const onBreak = Boolean(session?.status === "paused" && session.breakStartedAt);
  const currentBreakSeconds = session?.breakStartedAt ? Math.max(0, Math.floor((now - new Date(session.breakStartedAt).getTime()) / 1000)) : 0;
  const plannedBreakSeconds = (current?.breakMinutes ?? 0) * 60;
  const totalBreakSeconds = session ? elapsedBreakSeconds(session.breakStartedAt, session.accumulatedBreakSeconds, now) : 0;
  const { overtime: breakOvertime, remaining: breakRemaining } = getBreakTimeState(plannedBreakSeconds, totalBreakSeconds);
  const next = today.find((item) => item.status === "scheduled" || item.status === "snoozed");
  const confirmFinish = async (result: "completed" | "incomplete") => {
    const confirmed = window.confirm(result === "completed"
      ? "이 일정을 정말 완료로 기록할까요?"
      : "이 일정을 정말 미완료로 기록할까요?");
    if (!confirmed || !session) return;
    if (snapshot.tabOrganizerSettings.restoreLayoutOnFinish === "ask" && window.confirm("탭을 정리 전 배치로 복원할까요?\n취소를 누르면 현재 그룹을 유지합니다.")) {
      try { await sendMessage({ type: "TAB_LAYOUT_RESTORE", sessionId: session.id }); } catch { /* 집중 종료는 계속 */ }
    }
    await run({ type: "FOCUS_FINISH", result });
  };
  return <div className="app-shell popup">
    <BrandHeader subtitle="빠른 집중 컨트롤" />
    <main className="content">
      {actionError && <div className="action-error-banner" role="alert"><span>{actionError}</span><button type="button" onClick={dismissActionError} aria-label="오류 메시지 닫기">닫기</button></div>}
      {sidePanelError && <div className="action-error-banner" role="alert"><span>{sidePanelError}</span><button type="button" onClick={() => setSidePanelError(null)} aria-label="오류 메시지 닫기">닫기</button></div>}
      <div className="stack">
        {current && session ? <article className="card schedule-card popup-focus-card">
          <div className="schedule-card-header"><div><span className="eyebrow">{timeEnded ? "결과 선택 대기" : onBreak ? "휴식 시간 측정 중" : "현재 일정"}</span><h2>{current.title}</h2></div><span className="badge">{timeEnded ? "시간 종료" : onBreak ? breakOvertime > 0 ? "휴식 초과" : "휴식 중" : session.status === "paused" ? "일시정지" : "집중 중"}</span></div>
          <div className="timer">{onBreak ? breakOvertime > 0 ? `+${formatClock(breakOvertime)}` : formatClock(breakRemaining) : formatClock(Math.min(elapsed, current.targetFocusMinutes * 60))}</div>
          <div className="schedule-meta">{onBreak && <><span>이번 휴식 {formatClock(currentBreakSeconds)}</span><span>누적 {formatClock(totalBreakSeconds)}</span></>}<span>{onBreak ? `권장 총 ${current.breakMinutes}분` : `${current.targetFocusMinutes}분 목표`}</span>{!onBreak && <span>{current.breakMinutes > 0 ? `${current.breakMinutes}분 권장 휴식` : "휴식 미설정"}</span>}<span>{current.blockingMode === "allowlist" ? "허용 사이트만" : current.blockingMode === "blocklist" ? "방해 사이트 차단" : "차단 꺼짐"}</span></div>
          <div className="schedule-card-actions">{!timeEnded && (session.status === "active" ? <><button className="button secondary" onClick={() => run({ type: "FOCUS_PAUSE" })}>멈춤</button><button className="button secondary" onClick={() => run({ type: "FOCUS_BREAK" })}>휴식 시작</button></> : <button className="button" onClick={() => run({ type: "FOCUS_RESUME" })}>{onBreak ? "집중 재개" : "재개"}</button>)}{!timeEnded && <button className="button ghost" disabled={organizingTabs || !snapshot.tabOrganizerSettings.enabled} onClick={() => { setOrganizingTabs(true); void sendMessage({ type: "TAB_ORGANIZE", mode: "smart" }).catch((cause: unknown) => setSidePanelError(cause instanceof Error ? cause.message : "탭을 정리하지 못했습니다.")).finally(() => setOrganizingTabs(false)); }}>{organizingTabs ? "정리 중…" : "탭 정리"}</button>}<button className="button" onClick={() => void confirmFinish("completed")}>{timeEnded ? "완료했어요" : "완료"}</button><button className="button ghost" onClick={() => void confirmFinish("incomplete")}>{timeEnded ? "미완료예요" : "종료"}</button></div>
        </article> : <article className="card schedule-card">
          <div className="schedule-card-header"><div><span className="eyebrow">다음 일정</span><h2>{next?.title ?? "예정된 일정 없음"}</h2></div>{next && <span className="badge">예정</span>}</div>
          {next && <><div className="schedule-meta"><span>{new Date(next.startAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span><span>{next.targetFocusMinutes}분 집중</span><span>{next.breakMinutes > 0 ? `${next.breakMinutes}분 권장 휴식` : "휴식 미설정"}</span></div><div className="schedule-card-actions"><button className="button" onClick={() => startFocus(next.id)}>집중 시작</button><button className="button secondary" onClick={() => run({ type: "SCHEDULE_SNOOZE", scheduleId: next.id, minutes: 5 })}>5분 미루기</button></div></>}
        </article>}
        <article className="card"><h3>오늘 달성률</h3><ProgressBar value={rate} label={`${completed}/${today.length}개 완료`} /></article>
        <div className="popup-footer-actions"><button className="button secondary" onClick={openSidePanel} disabled={currentWindowId === null}>{currentWindowId === null ? "Side Panel 준비 중…" : "Side Panel 열기"}</button><button className="button ghost" onClick={() => openExtensionPage()}>전체 화면</button></div>
      </div>
    </main>
  </div>;
}
