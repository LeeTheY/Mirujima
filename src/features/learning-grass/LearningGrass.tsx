import { useMemo, useState } from "react";
import { useApp } from "../../shared/ui/AppContext";
import { hasPremiumEntitlement } from "../membership/types";
import { monthDateKeys } from "./learning";

export function LearningGrass() {
  const { snapshot } = useApp();
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const enabled = hasPremiumEntitlement(snapshot.membership, "learning-grass");
  const byDate = useMemo(() => new Map(snapshot.cloudSync.learningDays.map((day) => [day.dateKey, day])), [snapshot.cloudSync.learningDays]);
  const dateKeys = monthDateKeys(month.getFullYear(), month.getMonth());
  const selected = selectedDate ? byDate.get(selectedDate) : undefined;
  if (!enabled) return <article className="card learning-grass locked"><span className="eyebrow">Premium</span><h2>학습 잔디</h2><p>Premium에서 실제 집중 시간과 완료 일정을 바탕으로 월간 학습 기록을 확인할 수 있습니다.</p></article>;
  return <article className="card learning-grass">
    <header className="learning-grass-header"><div><span className="eyebrow">Premium 학습 기록</span><h2>{month.getFullYear()}년 {month.getMonth() + 1}월</h2></div><div className="row"><button className="button ghost" aria-label="이전 달" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>이전</button><button className="button ghost" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>오늘</button><button className="button ghost" aria-label="다음 달" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>다음</button></div></header>
    <div className="grass-weekdays" aria-hidden="true">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="grass-grid">{dateKeys.map((dateKey, index) => dateKey ? <button key={dateKey} type="button" className={`grass-day intensity-${byDate.get(dateKey)?.intensity ?? 0}`} aria-label={`${dateKey}, 학습 강도 ${byDate.get(dateKey)?.intensity ?? 0}`} title={`${dateKey} · 집중 ${byDate.get(dateKey)?.actualFocusMinutes ?? 0}분 · 완료 ${byDate.get(dateKey)?.completedScheduleCount ?? 0}개`} onClick={() => setSelectedDate(dateKey)}><span>{Number(dateKey.slice(-2))}</span></button> : <span className="grass-day empty" key={`empty:${index}`} />)}</div>
    <div className="grass-legend"><span>기록 없음</span>{[0, 1, 2, 3, 4].map((value) => <i key={value} className={`intensity-${value}`} />)}<span>집중 높음</span></div>
    {selectedDate && <div className="grass-detail" role="status"><strong>{selectedDate}</strong><span>집중 {selected?.actualFocusMinutes ?? 0}분</span><span>완료 일정 {selected?.completedScheduleCount ?? 0}개</span><span>목표 달성률 {selected?.achievementRate ?? 0}%</span></div>}
  </article>;
}
