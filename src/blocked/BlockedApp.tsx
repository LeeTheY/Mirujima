import { useEffect, useState } from "react";
import { useApp } from "../shared/ui/AppContext";
import { DomainChips } from "../shared/ui/components";
import { formatClock } from "../shared/time/time";
import { useNow } from "../shared/time/useNow";

export function BlockedApp() {
  const { snapshot, run } = useApp();
  const now = useNow();
  const [minutes, setMinutes] = useState(1);
  const [reason, setReason] = useState("긴급한 업무 확인");
  const hostname = new URLSearchParams(location.search).get("host")?.replace(/^www\./, "") ?? "알 수 없는 사이트";
  const session = snapshot.activeSession;
  const schedule = session ? snapshot.schedules.find((item) => item.id === session.scheduleId) : undefined;
  useEffect(() => { if (hostname !== "알 수 없는 사이트") void run({ type: "BLOCKED_ATTEMPT", hostname }).catch(() => undefined); }, [hostname, run]);
  const remaining = schedule ? Math.max(0, Math.floor((new Date(schedule.endAt).getTime() - now) / 1000)) : 0;
  const allow = async () => {
    await run({ type: "TEMPORARY_ALLOW", hostname, minutes, reason });
    location.href = `https://${hostname}`;
  };
  return <main className="blocked-page">
    <section className="blocked-card">
      <header className="blocked-hero">
        <div className="blocked-brand-row">
          <img className="blocked-brand-icon" src="/icons/Mirujima_Icon.png" alt="" />
          <div className="blocked-brand-copy"><strong>미루지마</strong><span>집중을 지키는 중</span></div>
          <span className="badge warning">집중 보호 중</span>
        </div>
        <div className="blocked-title-group">
          <span className="eyebrow">접근이 차단됐어요</span>
          <h1><span className="blocked-hostname">{hostname}</span>은 지금 계획에 없는 사이트예요.</h1>
          <p>{schedule ? `현재 “${schedule.title}” 일정에 집중하고 있습니다.` : "활성 집중 일정의 차단 규칙에 따라 이동했습니다."}</p>
        </div>
      </header>

      <div className="blocked-content">
        <section className="blocked-status" aria-label="집중 일정 남은 시간">
          <div><span className="small muted">집중 일정 남은 시간</span><div className="blocked-timer" aria-live="polite">{formatClock(remaining)}</div></div>
          <button className="button" onClick={() => history.length > 1 ? history.back() : run({ type: "OPEN_MAIN_UI", target: "sidepanel" })}>집중 화면으로 돌아가기</button>
        </section>

        {schedule && schedule.allowedDomains.length > 0 && <section className="blocked-allowed-sites">
          <strong>이번 일정에서 허용된 사이트</strong>
          <DomainChips domains={schedule.allowedDomains} />
        </section>}

        <section className="temporary-allow-panel">
          <div className="temporary-allow-heading">
            <div><span className="eyebrow">꼭 필요한 경우에만</span><h2>긴급 임시 허용</h2></div>
            <p>허용한 hostname, 시간, 이유가 이 세션 기록에 남습니다.</p>
          </div>
          <div className="temporary-allow-fields">
            <div className="field"><label htmlFor="allow-time">허용 시간</label><select id="allow-time" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}><option value="1">1분</option><option value="5">5분</option><option value="0">이번 세션</option></select></div>
            <div className="field"><label htmlFor="allow-reason">허용 이유</label><input id="allow-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 업무상 자료 확인" /></div>
          </div>
          <button className="button danger temporary-allow-button" onClick={allow} disabled={!reason.trim()}>이유를 기록하고 임시 허용</button>
        </section>
      </div>
    </section>
  </main>;
}
