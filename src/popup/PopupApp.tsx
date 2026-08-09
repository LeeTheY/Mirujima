import { useEffect, useState } from "react";
import { sendMessage } from "../shared/chrome/messaging";
import { useApp } from "../shared/ui/AppContext";
import { BrandHeader } from "../shared/ui/components";
import { openWebApp } from "../shared/ui/extension-navigation";
import { elapsedFocusSeconds, formatClock, remainingFocusSeconds } from "../shared/time/time";
import { useNow } from "../shared/time/useNow";
import { popupPrimaryAction } from "./popup-state";

export function PopupApp() {
  const { snapshot, run, actionError, dismissActionError } = useApp();
  const now = useNow();
  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [organizingTabs, setOrganizingTabs] = useState(false);
  const session = snapshot.activeSession;
  const schedule = session ? snapshot.schedules.find((item) => item.id === session.scheduleId) : undefined;
  const elapsed = session ? elapsedFocusSeconds(session.startedAt, session.pausedAt, session.accumulatedFocusSeconds, now) : 0;
  const remaining = remainingFocusSeconds(schedule?.targetFocusMinutes ?? 0, elapsed);
  const primaryAction = popupPrimaryAction(Boolean(session && schedule));

  useEffect(() => {
    void chrome.windows.getCurrent().then((currentWindow) => setCurrentWindowId(currentWindow.id ?? null));
  }, []);

  function openSidePanel() {
    if (currentWindowId === null) return setLocalError("현재 Chrome 창을 확인하고 있습니다. 잠시 후 다시 눌러 주세요.");
    setLocalError(null);
    void chrome.sidePanel.open({ windowId: currentWindowId })
      .then(() => window.close())
      .catch((cause: unknown) => setLocalError(cause instanceof Error ? cause.message : "Side Panel을 열지 못했습니다."));
  }

  async function organizeTabs() {
    setOrganizingTabs(true);
    setLocalError(null);
    try {
      await sendMessage({ type: "TAB_ORGANIZE", mode: "smart" });
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "탭을 정리하지 못했습니다.");
    } finally {
      setOrganizingTabs(false);
    }
  }

  async function finish(result: "completed" | "incomplete") {
    if (!window.confirm(result === "completed" ? "집중을 완료로 기록할까요?" : "집중을 미완료로 종료할까요?")) return;
    await run({ type: "FOCUS_FINISH", result });
  }

  return (
    <div className="app-shell popup">
      <BrandHeader subtitle="브라우저 집중 컨트롤러" />
      <main className="content">
        {actionError && (
          <div className="action-error-banner" role="alert">
            <span>{actionError}</span>
            <button type="button" onClick={dismissActionError}>닫기</button>
          </div>
        )}
        {localError && (
          <div className="action-error-banner" role="alert">
            <span>{localError}</span>
            <button type="button" onClick={() => setLocalError(null)}>닫기</button>
          </div>
        )}
        <div className="stack">
          {session && schedule ? (
            <article className="focus-timer-panel popup-focus-card">
              <div className="flex items-center justify-between w-full">
                <span className="focus-section-label">
                  {session.status === "paused" ? "일시정지" : "현재 집중 중"}
                </span>
                <span className={`badge ${session.status === "paused" ? "warning" : ""}`}>
                  {remaining === 0 ? "결과 대기" : session.status === "paused" ? "멈춤" : "집중 보호 중"}
                </span>
              </div>
              <h2 className="text-white text-xl font-extrabold m-0 mt-1">{schedule.title}</h2>
              <div className="focus-timer">{formatClock(remaining)}</div>
              <div className="focus-time-meta">
                <span>{schedule.targetFocusMinutes}분 목표</span>
                <span>
                  {schedule.blockingMode === "allowlist"
                    ? "허용 사이트만"
                    : schedule.blockingMode === "blocklist"
                    ? "방해 사이트 차단"
                    : "차단 꺼짐"}
                </span>
              </div>
              <div className="schedule-card-actions w-full mt-2">
                {remaining > 0 &&
                  (session.status === "active" ? (
                    <button className="button secondary" onClick={() => run({ type: "FOCUS_PAUSE" })}>
                      일시정지
                    </button>
                  ) : (
                    <button className="button" onClick={() => run({ type: "FOCUS_RESUME" })}>
                      집중 재개
                    </button>
                  ))}
                <button
                  className="button ghost"
                  disabled={organizingTabs || !snapshot.tabOrganizerSettings.enabled}
                  onClick={() => void organizeTabs()}
                >
                  {organizingTabs ? "정리 중…" : "탭 정리"}
                </button>
                <button className="button" onClick={() => void finish("completed")}>
                  완료
                </button>
                <button className="button danger" onClick={() => void finish("incomplete")}>
                  종료
                </button>
              </div>
            </article>
          ) : (
            <article className="card schedule-card">
              <span className="eyebrow">WEB CONTROL PLANE</span>
              <h2>진행 중인 집중이 없습니다.</h2>
              <p>계획 작성과 기록 관리는 Web에서 진행하고, 시작된 집중은 이곳에서 계속 제어할 수 있습니다.</p>
              <button className="button full" onClick={() => openWebApp(primaryAction.path ?? "/focus")}>
                {primaryAction.label}
              </button>
            </article>
          )}

          <div className="popup-footer-actions">
            <button className="button secondary" onClick={openSidePanel} disabled={currentWindowId === null}>
              Side Panel 열기
            </button>
            <button className="button ghost" onClick={() => openWebApp("/home")}>
              Web 홈 이동
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
