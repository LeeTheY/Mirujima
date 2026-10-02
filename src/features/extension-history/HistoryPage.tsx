import { useEffect, useState } from "react";
import type { HistoryPeriod } from "@mirujima/contracts";
import { useApp } from "../../shared/ui/AppContext";
import { openWebApp } from "../../shared/ui/extension-navigation";
import { ConnectionCard } from "../web-bridge/ConnectionCard";
import { loadHistoryOverview, type HistoryOverview } from "./data";

export function HistoryPage() {
  const { snapshot } = useApp();
  const userId = snapshot.membership.userId;
  const [period, setPeriod] = useState<HistoryPeriod>("weekly");
  const [selected, setSelected] = useState<string>();
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<{ key: string; data?: HistoryOverview; error?: string }>();
  const key = `${userId}:${period}:${selected ?? ""}:${reload}`;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void loadHistoryOverview(userId, period, selected).then((data) => {
      if (!cancelled) setState({ key, data });
    }).catch((error: unknown) => {
      if (!cancelled) setState({ key, error: error instanceof Error ? error.message : "기록을 불러오지 못했습니다." });
    });
    return () => { cancelled = true; };
  }, [userId, period, selected, key]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") setReload((value) => value + 1); }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const data = state?.key === key ? state.data : undefined;
  const history = data?.student ?? data?.guardian;
  const summary = history?.summary;
  return <section className="focus-page">
    <header className="page-heading"><h1 className="page-title">집중 기록</h1><p className="page-lead">웹과 같은 기록을 간단히 확인하세요.</p></header>
    {!userId ? <ConnectionCard /> : <>
      <div className="history-toolbar"><div className="period-control" aria-label="조회 기간">{([['daily', '오늘'], ['weekly', '이번 주'], ['monthly', '이번 달']] as const).map(([value, label]) => <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}</div><button className="button ghost" onClick={() => setReload((value) => value + 1)}>새로고침</button></div>
      {state?.key === key && state.error ? <div className="alert error" role="alert">{state.error}</div> : !data ? <p className="muted small" role="status">기록을 불러오고 있어요…</p> : <>
        {data.students.length > 0 && <label className="field">학생 선택<select value={selected ?? data.guardian?.student.userId ?? data.students[0].id} onChange={(event) => setSelected(event.target.value)}>{data.students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>}
        {summary && history ? <article className="card history-summary"><div className="row between"><h2>{data.guardian ? `${data.guardian.student.displayName}의 기록` : "집중 요약"}</h2><span className="small muted">{history.range.startDate.slice(5)} ~ {history.range.endDate.slice(5)}</span></div><div className="extension-summary-grid">
          <div><span>집중 시간</span><strong>{summary.totalFocusMinutes === null ? "비공개" : `${summary.totalFocusMinutes}분`}</strong></div>
          <div><span>달성률</span><strong>{summary.completionRate === null ? "비공개" : `${summary.completionRate}%`}</strong></div>
          <div><span>완료 목표</span><strong>{summary.completedGoalCount === null ? "비공개" : `${summary.completedGoalCount}개`}</strong></div>
          {data.student ? <div><span>획득 포인트</span><strong>{data.student.summary.earnedPoints.toLocaleString()}P</strong></div> : <div><span>보상 기록</span><strong>{data.guardian?.summary.rewardCount === null ? "비공개" : `${data.guardian?.summary.rewardCount ?? 0}건`}</strong></div>}
        </div>{data.student && <p className="small">연속 {data.student.summary.focusStreakDays}일 · 성공 {data.student.summary.successfulSessionCount}회 · 실패 {data.student.summary.failedSessionCount}회</p>}{data.guardian && <p className="small">학생이 공유한 항목만 표시합니다.</p>}</article> : <article className="card"><h2>연결된 학생이 없습니다</h2><p>웹에서 학생을 연결하면 공유된 기록을 볼 수 있어요.</p></article>}
        {data.student && <article className="card"><h2>최근 집중</h2>{data.student.sessions.length === 0 ? <p>이 기간에 완료된 기록이 없어요.</p> : <ul className="extension-history-list">{data.student.sessions.slice(0, 5).map((session) => <li key={session.sessionId}><div><strong>{session.goals[0]?.name ?? "집중 세션"}</strong><span>{session.dateKey.slice(5)} · {session.focusMinutes}분 · 목표 {session.completedGoalCount}/{session.totalGoalCount}</span></div><span className={`badge ${session.status !== 'success' ? 'warning' : ''}`}>{session.status === 'success' ? '성공' : session.status === 'cancelled' ? '취소' : '미완료'}</span></li>)}</ul>}</article>}
      </>}
      <button className="button secondary" onClick={() => openWebApp(`/history?period=${period}${selected ? `&student=${encodeURIComponent(selected)}` : ''}`)}>전체 기록 보기</button>
    </>}
  </section>;
}
