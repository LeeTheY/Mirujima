import { useApp } from "../../shared/ui/AppContext";
import { DomainChips, EmptyState, ProgressBar } from "../../shared/ui/components";
import { toDateKey } from "../../shared/time/time";
import { getScheduleStatusLabel } from "../schedules/schedule-labels";
import { calculateLearningStreak } from "../learning-grass/learning";
import { hasPremiumEntitlement } from "../membership/types";

export function TodayPage({ goFocus, goPlan }: { goFocus: () => void; goPlan: () => void }) {
  const { snapshot, run } = useApp();
  const today = toDateKey();
  const schedules = snapshot.schedules.filter((item) => item.dateKey === today).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const completed = schedules.filter((item) => item.status === "completed").length;
  const rate = schedules.length ? Math.round(completed / schedules.length * 100) : 0;
  const active = snapshot.activeSession ? schedules.find((item) => item.id === snapshot.activeSession?.scheduleId) : undefined;
  const next = schedules.find((item) => item.status === "scheduled" || item.status === "snoozed");
  const importantAlerts = Object.values(snapshot.notificationState)
    .filter((item) => !item.handled)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const activeDomains = active?.blockingMode === "blocklist" ? active.blockedDomains : active?.allowedDomains ?? [];
  const nextDomains = next?.blockingMode === "blocklist" ? next.blockedDomains : next?.allowedDomains ?? [];
  const learningEnabled = hasPremiumEntitlement(snapshot.membership, "learning-grass");
  const learningStreak = calculateLearningStreak(snapshot.cloudSync.learningDays, today);
  const startFocus = (scheduleId: string) => {
    const shouldOrganize = snapshot.tabOrganizerSettings.enabled
      && snapshot.tabOrganizerSettings.organizeOnFocusStart
      && window.confirm("집중을 시작하기 전에 현재 창의 탭을 그룹화할까요?\n취소를 눌러도 집중은 그대로 시작합니다.");
    void run({ type: "FOCUS_START", scheduleId, organizeTabs: shouldOrganize });
  };
  const confirmFinish = (result: "completed" | "incomplete") => {
    const confirmed = window.confirm(result === "completed"
      ? "이 일정을 정말 완료로 기록할까요?"
      : "이 일정을 정말 미완료로 기록할까요?");
    if (confirmed) void run({ type: "FOCUS_FINISH", result });
  };
  return <section>
    <h1 className="page-title">오늘</h1><p className="page-lead">작게 계획하고, 바로 시작하세요.</p>
    <div className="stack">
      {importantAlerts.length > 0 && <section className="notification-center" aria-label="확인할 알림">
        <header className="notification-center-header"><div><span className="eyebrow">놓치지 마세요</span><h2>확인할 알림 {importantAlerts.length}개</h2></div></header>
        <div className="notification-list">{importantAlerts.map((notification) => {
          const isFocusEnd = notification.id.startsWith("focus-end:");
          const opensFocus = isFocusEnd || notification.id.startsWith("focus-check:") || notification.id.startsWith("idle-check:") || notification.id.startsWith("distraction-detected:") || notification.id.startsWith("break-end:");
          return <article className="notification-item" key={notification.id}>
            <div className="notification-copy"><strong>{notification.title ?? "집중 상태를 확인해 주세요"}</strong><p>{notification.message}</p><time>{new Date(notification.sentAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</time></div>
            <div className="notification-actions">{isFocusEnd && snapshot.activeSession
              ? <><button className="button" onClick={() => confirmFinish("completed")}>완료</button><button className="button ghost" onClick={() => confirmFinish("incomplete")}>미완료</button></>
              : <button className="button secondary" onClick={opensFocus ? goFocus : goPlan}>{opensFocus ? "집중 화면 보기" : "일정 보기"}</button>}
              <button className="button ghost" onClick={() => run({ type: "NOTIFICATION_HANDLE", notificationId: notification.id })}>확인 처리</button>
            </div>
          </article>;
        })}</div>
      </section>}
      {active ? <article className="card schedule-card">
        <div className="schedule-card-header"><div><span className="eyebrow">현재 일정</span><h2>{active.title}</h2></div><span className="badge">집중 중</span></div>
        <div className="schedule-meta"><span>{active.targetFocusMinutes}분 집중</span><span>{active.breakMinutes > 0 ? `${active.breakMinutes}분 권장 휴식` : "휴식 미설정"}</span><span>{active.blockingMode === "allowlist" ? "허용 사이트만" : active.blockingMode === "blocklist" ? "방해 사이트 차단" : "사이트 차단 꺼짐"}</span></div>
        {active.blockingMode !== "off" && <div className="schedule-sites"><strong>{active.blockingMode === "blocklist" ? "차단 중인 사이트" : "허용된 사이트"}</strong><DomainChips domains={activeDomains} /></div>}
        <div className="schedule-card-actions"><button className="button" onClick={goFocus}>집중 화면 보기</button></div>
      </article>
        : next ? <article className="card schedule-card">
          <div className="schedule-card-header"><div><span className="eyebrow">다음 일정</span><h2>{next.title}</h2></div><span className={`badge ${next.status === "snoozed" ? "warning" : ""}`}>{next.status === "snoozed" ? "미룸" : "예정"}</span></div>
          <div className="schedule-meta"><span>{new Date(next.startAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span><span>{next.targetFocusMinutes}분 집중</span><span>{next.breakMinutes > 0 ? `${next.breakMinutes}분 권장 휴식` : "휴식 미설정"}</span><span>{next.blockingMode === "allowlist" ? "허용 사이트만" : next.blockingMode === "blocklist" ? "방해 사이트 차단" : "차단 꺼짐"}</span></div>
          {next.blockingMode !== "off" && <div className="schedule-sites"><strong>{next.blockingMode === "blocklist" ? "차단할 사이트" : "허용할 사이트"}</strong><DomainChips domains={nextDomains} /></div>}
          <div className="schedule-card-actions"><button className="button" onClick={() => startFocus(next.id)}>지금 집중 시작</button><button className="button secondary" onClick={() => run({ type: "SCHEDULE_SNOOZE", scheduleId: next.id, minutes: 5 })}>5분 미루기</button></div>
        </article>
          : <EmptyState><p>오늘 예정된 일정이 없어요.</p><button className="button" onClick={goPlan}>첫 일정 만들기</button></EmptyState>}
      <article className="card achievement-card"><h3>오늘 달성률</h3><ProgressBar value={rate} label={`${completed}/${schedules.length}개 완료`} /></article>
      {learningEnabled && <article className="card learning-streak-card"><span className="eyebrow">Premium 학습 잔디</span><h3>연속 학습 {learningStreak}일</h3><p className="small muted">오늘 집중 기록은 리포트를 집계하면 잔디에 반영됩니다.</p></article>}
      {schedules.length > 0 && <article className="card"><h3>오늘 일정</h3><div className="schedule-list">{schedules.map((item) => <div className="schedule-list-item" key={item.id}><div><strong>{item.title}</strong><div className="small muted">{new Date(item.startAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} · 집중 {item.targetFocusMinutes}분 · {item.breakMinutes > 0 ? `휴식 ${item.breakMinutes}분` : "휴식 미설정"}</div></div><span className={`badge ${item.status === "snoozed" ? "warning" : ""}`}>{getScheduleStatusLabel(item.status)}</span></div>)}</div></article>}
    </div>
  </section>;
}
