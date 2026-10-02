import { ConnectionCard } from "../web-bridge/ConnectionCard";
import { useMemo, useState } from "react";
import { completionPercentForGoals } from "@mirujima/contracts";
import { useApp } from "../../shared/ui/AppContext";
import { DomainChips, EmptyState, ProgressBar } from "../../shared/ui/components";
import { elapsedBreakSeconds, elapsedFocusSeconds, formatClock, getBreakTimeState, remainingFocusSeconds } from "../../shared/time/time";
import { useNow } from "../../shared/time/useNow";
import { TabOrganizerCard } from "../tab-organizer/TabOrganizerCard";
import { sendMessage } from "../../shared/chrome/messaging";
import { openWebApp } from "../../shared/ui/extension-navigation";

export function FocusPage() {
  const { snapshot, run } = useApp();
  const now = useNow();
  const [completedGoalIds, setCompletedGoalIds] = useState<string[]>([]);
  const session = snapshot.activeSession;
  const schedule = session ? snapshot.schedules.find((item) => item.id === session.scheduleId) : undefined;
  const elapsed = useMemo(() => session ? elapsedFocusSeconds(session.startedAt, session.pausedAt, session.accumulatedFocusSeconds, now) : 0, [session, now]);
  const target = (schedule?.targetFocusMinutes ?? 0) * 60;
  const remaining = remainingFocusSeconds(schedule?.targetFocusMinutes ?? 0, elapsed);
  if (!session || !schedule) return <section className="focus-page"><header className="page-heading"><h1 className="page-title">집중</h1><p className="page-lead">진행 중인 집중 세션을 관리합니다.</p></header><ConnectionCard /><EmptyState><div><strong>집중을 시작할 준비가 됐나요?</strong><p>웹에서 계획을 선택하면 이곳에서 타이머와 사이트 차단을 관리할 수 있어요.</p></div><button className="button" onClick={() => openWebApp("/focus")}>집중 계획 열기</button></EmptyState></section>;

  if (session.canonicalStatus === "starting") return <section className="focus-page">
    <header className="page-heading"><h1 className="page-title">집중 준비 중</h1><p className="page-lead">사이트 차단 적용과 서버 시작 확인을 기다립니다. 아직 집중 시간은 시작되지 않았습니다.</p></header>
    <ConnectionCard />
    <article className="card"><h2>{schedule.title}</h2><button className="button" onClick={() => openWebApp("/focus")}>웹에서 준비 상태 확인</button></article>
  </section>;

  const progress = target ? Math.min(100, Math.round(elapsed / target * 100)) : 0;
  const sessionDomains = schedule.blockingMode === "blocklist" ? schedule.blockedDomains : schedule.allowedDomains;
  const timeEnded = session.status === "awaiting-result" || remaining === 0;
  const settlementGoals = session.goals ?? schedule.goals ?? [];
  const completionPercent = settlementGoals.length > 0
    ? completionPercentForGoals(settlementGoals.length, completedGoalIds.length)
    : 0;
  const depositPoints = session.selfDepositPoints ?? schedule.selfDepositPoints ?? 0;
  const expectedEarnedPoints = session.depositPolicy?.mode === "all-or-none" ? completionPercent === 100 ? depositPoints : 0 : Math.floor(depositPoints * completionPercent / 100);
  const onBreak = session.status === "paused" && Boolean(session.breakStartedAt);
  const currentBreakSeconds = session.breakStartedAt
    ? Math.max(0, Math.floor((now - new Date(session.breakStartedAt).getTime()) / 1000))
    : 0;
  const plannedBreakSeconds = schedule.breakMinutes * 60;
  const totalBreakSeconds = elapsedBreakSeconds(session.breakStartedAt, session.accumulatedBreakSeconds, now);
  const { remaining: breakRemaining, overtime: breakOvertime } = getBreakTimeState(plannedBreakSeconds, totalBreakSeconds);
  const confirmFinish = async (result: "completed" | "incomplete") => {
    const confirmed = window.confirm(result === "completed"
      ? "이 일정을 정말 완료로 기록할까요?"
      : "이 일정을 정말 미완료로 기록할까요?");
    if (!confirmed) return;
    if (snapshot.tabOrganizerSettings.restoreLayoutOnFinish === "ask" && window.confirm("탭을 정리 전 배치로 복원할까요?\n취소를 누르면 현재 그룹을 유지합니다.")) {
      try { await sendMessage({ type: "TAB_LAYOUT_RESTORE", sessionId: session.id }); } catch { /* 종료는 탭 복원 실패와 독립적 */ }
    }
    await run({ type: "FOCUS_FINISH", result });
  };

  const confirmCanonicalFinish = async (goalIds: string[]) => {
    const selectedPercent = settlementGoals.length > 0
      ? completionPercentForGoals(settlementGoals.length, goalIds.length)
      : 0;
    if (!window.confirm(`${settlementGoals.length}개 중 ${goalIds.length}개 완료(${selectedPercent}%)로 정산할까요?`)) return;
    await run({ type: "CANONICAL_FOCUS_FINISH", completedGoalIds: goalIds });
  };

  const toggleGoal = (goalId: string) => {
    setCompletedGoalIds((current) => current.includes(goalId)
      ? current.filter((id) => id !== goalId)
      : [...current, goalId]);
  };

  if (timeEnded) return <section className="focus-page focus-result-page">
    <header className="page-heading"><h1 className="page-title">집중 결과 확인</h1><p className="page-lead">목표 시간이 끝났습니다. 결과를 선택하면 오늘 기록에 반영됩니다.</p></header>
    <article className="card focus-result-card">
      <div><span className="eyebrow">결과 선택 대기</span><h2>{schedule.title}</h2></div>
      <div className="focus-result-time"><span>집중한 시간</span><strong>{formatClock(Math.min(elapsed, target))}</strong><small>목표 {schedule.targetFocusMinutes}분</small></div>
      {session.canonical ? (
        <>
          <p>{session.depositPolicy?.mode === "all-or-none" ? "모든 목표를 완료하면 예약 포인트 전액을 획득합니다. 일부 목표가 남으면 예약 포인트 전액을 반환합니다." : "기존 세션 정책: 전부 완료 100% · 절반 이상 80% · 일부 완료 60% · 완료 없음 0%로 정산됩니다."}</p>
          <div className="canonical-goal-checklist">
            {settlementGoals.map((goal) => (
              <label key={goal.id} className={completedGoalIds.includes(goal.id) ? "selected" : ""}>
                <input type="checkbox" checked={completedGoalIds.includes(goal.id)} onChange={() => toggleGoal(goal.id)} />
                <span><strong>{goal.name}</strong><small>{goal.minutes}분 · {goal.detail || "세부 설명 없음"}</small></span>
              </label>
            ))}
          </div>
          <div className="canonical-settlement-summary">
            <strong>{settlementGoals.length}개 중 {completedGoalIds.length}개 · {completionPercent}%</strong>
            <span>예상 획득 {expectedEarnedPoints.toLocaleString()}P</span>
          </div>
          <div className="focus-result-actions">
            <button className="button" disabled={settlementGoals.length === 0} onClick={() => void confirmCanonicalFinish(completedGoalIds)}>선택한 목표로 정산</button>
          </div>
        </>
      ) : (
        <>
          <p>계획한 작업을 마쳤다면 완료, 끝내지 못했다면 미완료를 선택해 주세요.</p>
          <div className="focus-result-actions"><button className="button" onClick={() => void confirmFinish("completed")}>완료했어요</button><button className="button ghost" onClick={() => void confirmFinish("incomplete")}>미완료예요</button></div>
        </>
      )}
    </article>
  </section>;

  return <section className="focus-page">
    <header className="page-heading"><h1 className="page-title">집중</h1><p className="page-lead">{onBreak ? breakOvertime > 0 ? "설정한 휴식 시간을 넘겼습니다. 초과 시간도 기록 중이에요." : "휴식 중입니다. 집중 타이머와 사이트 차단은 멈춰 있습니다." : session.status === "paused" ? "타이머가 멈춰 있습니다. 준비되면 다시 시작하세요." : "지금 할 일 하나에만 머물러 보세요."}</p></header>
    <div className="focus-layout">
      <article className="card focus-session-card">
        <header className="focus-session-header">
          <div><span className="eyebrow">현재 집중 일정</span><h2>{schedule.title}</h2></div>
          <span className={`badge ${session.status === "paused" ? "warning" : ""}`}>{onBreak ? breakOvertime > 0 ? "휴식 초과" : "휴식 중" : session.status === "paused" ? "일시정지" : "집중 중"}</span>
        </header>

        {onBreak ? <section className={`focus-timer-panel break-timer-panel ${breakOvertime > 0 ? "overtime" : ""}`} aria-label="휴식 타이머">
          <span className="focus-section-label">{breakOvertime > 0 ? "휴식 초과 시간" : "남은 휴식 시간"}</span>
          <div className="focus-timer" aria-live="polite">{breakOvertime > 0 ? `+${formatClock(breakOvertime)}` : formatClock(breakRemaining)}</div>
          <div className="focus-time-meta"><span>이번 휴식 {formatClock(currentBreakSeconds)}</span><span>누적 {formatClock(totalBreakSeconds)}</span><span>{session.canonical ? "자동 복귀 · 총" : "권장 총"} {schedule.breakMinutes}분</span></div>
        </section> : <section className="focus-timer-panel" aria-label="집중 타이머">
          <span className="focus-section-label">남은 시간</span>
          <div className="focus-timer" aria-live="polite">{formatClock(remaining)}</div>
          <div className="focus-time-meta"><span>진행 {formatClock(elapsed)}</span><span>목표 {schedule.targetFocusMinutes}분</span></div>
        </section>}

        <section className="focus-progress-panel">
          <ProgressBar value={progress} label="목표 진행률" />
        </section>

        {!onBreak && schedule.blockingMode !== "off" && <section className="focus-sites-panel">
          <div className="focus-section-heading"><div><span className="focus-section-label">{schedule.blockingMode === "blocklist" ? "현재 차단 사이트" : "현재 허용 사이트"}</span><p>{schedule.blockingMode === "blocklist" ? "목록에 있는 사이트만 차단합니다." : "목록에 있는 사이트와 서브도메인만 허용합니다."}</p></div></div>
          <DomainChips domains={sessionDomains} />
        </section>}

        <section className="focus-actions" aria-label="집중 세션 동작">
          {session.status === "active" ? <><button className="button secondary" onClick={() => run({ type: "FOCUS_PAUSE" })}>일시정지</button>{<button className="button secondary" disabled={session.canonical && (session.accumulatedBreakSeconds ?? 0) >= plannedBreakSeconds} onClick={() => run({ type: "FOCUS_BREAK" })}>휴식 시작</button>}</> : <button className="button" onClick={() => run({ type: "FOCUS_RESUME" })}>{onBreak ? "휴식 끝내고 집중 재개" : "다시 시작"}</button>}
          {session.canonical ? (
            <button className="button ghost" onClick={() => void confirmCanonicalFinish([])}>집중 포기</button>
          ) : (
            <><button className="button" onClick={() => void confirmFinish("completed")}>완료</button><button className="button ghost" onClick={() => void confirmFinish("incomplete")}>미완료로 종료</button></>
          )}
        </section>
      </article>

      <aside className="focus-side-column">
        <TabOrganizerCard />
        <article className="card focus-health-card">
          <header><span className="eyebrow">세션 상태</span><h3>집중 신호</h3></header>
          <div className="focus-metric-grid">
            <div className="focus-metric"><span>차단 시도</span><strong>{session.blockedAttemptCount}</strong><small>회</small></div>
            <div className="focus-metric"><span>상태 확인</span><strong>{session.checkInCount}</strong><small>회</small></div>
            <div className="focus-metric"><span>누적 휴식</span><strong>{Math.floor(totalBreakSeconds / 60)}</strong><small>분</small></div>
          </div>
          <div className="focus-policy-note"><strong>차단 방식</strong><span>{schedule.blockingMode === "allowlist" ? "허용 사이트만" : schedule.blockingMode === "blocklist" ? "방해 사이트만" : "차단 꺼짐"}</span></div>
        </article>
        <div className="focus-privacy-note"><strong>최소 활동 정보만 사용해요.</strong><p>Chrome 밖의 앱 사용 내용이나 페이지 입력값은 확인하지 않습니다.</p></div>
      </aside>
    </div>
  </section>;
}
