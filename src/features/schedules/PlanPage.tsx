import { useState } from "react";
import { useApp } from "../../shared/ui/AppContext";
import { DomainChips, EmptyState } from "../../shared/ui/components";
import type { Schedule } from "../../shared/types/models";
import { ScheduleForm } from "./ScheduleForm";
import { getScheduleStatusLabel } from "./schedule-labels";

export function PlanPage() {
  const { snapshot, run } = useApp();
  const [editing, setEditing] = useState<Schedule | "new" | null>(null);
  const startFocus = (scheduleId: string) => {
    const shouldOrganize = snapshot.tabOrganizerSettings.enabled
      && snapshot.tabOrganizerSettings.organizeOnFocusStart
      && window.confirm("집중을 시작하기 전에 현재 창의 탭을 그룹화할까요?\n취소를 눌러도 집중은 그대로 시작합니다.");
    void run({ type: "FOCUS_START", scheduleId, organizeTabs: shouldOrganize });
  };
  return <section><div className="row between"><div><h1 className="page-title">계획</h1><p className="page-lead">시간과 사용할 사이트를 미리 정해두세요.</p></div>{editing === null && <button className="button" onClick={() => setEditing("new")}>일정 추가</button>}</div>
    {editing && <ScheduleForm initial={editing === "new" ? undefined : editing} defaultBlockingMode={snapshot.settings.defaultBlockingMode} onCancel={() => setEditing(null)} onSave={async (schedule) => { await run({ type: editing === "new" ? "SCHEDULE_CREATE" : "SCHEDULE_UPDATE", payload: schedule }); setEditing(null); }} />}
    {!editing && <div className="stack">{snapshot.schedules.length === 0 ? <EmptyState>아직 일정이 없습니다.</EmptyState> : snapshot.schedules.slice().sort((a, b) => a.startAt.localeCompare(b.startAt)).map((item) => {
      const domains = item.blockingMode === "blocklist" ? item.blockedDomains : item.allowedDomains;
      return <article className="card schedule-card" key={item.id}>
        <div className="schedule-card-header"><div><span className="eyebrow">{item.dateKey} · {new Date(item.startAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span><h3>{item.title}</h3></div><span className={`badge ${item.status === "snoozed" ? "warning" : ""}`}>{getScheduleStatusLabel(item.status)}</span></div>
        <p className="schedule-description">{item.description || "설명 없이 등록된 일정입니다."}</p>
        <div className="schedule-meta"><span>{item.targetFocusMinutes}분 집중</span><span>{item.breakMinutes > 0 ? `${item.breakMinutes}분 권장 휴식` : "휴식 미설정"}</span><span>{item.activityMode}</span><span>{item.blockingMode === "allowlist" ? "허용 사이트만" : item.blockingMode === "blocklist" ? "방해 사이트 차단" : "차단 꺼짐"}</span></div>
        {item.blockingMode !== "off" && <div className="schedule-sites"><strong>{item.blockingMode === "blocklist" ? "차단할 사이트" : "허용할 사이트"}</strong><DomainChips domains={domains} /></div>}
        <div className="schedule-card-actions"><button className="button secondary" onClick={() => setEditing(item)}>수정</button><button className="button ghost" disabled={snapshot.activeSession?.scheduleId === item.id} onClick={() => { if (confirm("이 일정을 삭제할까요?")) void run({ type: "SCHEDULE_DELETE", scheduleId: item.id }); }}>삭제</button>{["scheduled", "snoozed"].includes(item.status) && <button className="button" onClick={() => startFocus(item.id)}>집중 시작</button>}</div>
      </article>;
    })}</div>}
  </section>;
}
