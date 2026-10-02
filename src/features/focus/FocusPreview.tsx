import { useEffect, useState } from "react";
import type { FocusPlan } from "@mirujima/contracts";
import { useApp } from "../../shared/ui/AppContext";
import { formatClock } from "../../shared/time/time";
import { openWebApp } from "../../shared/ui/extension-navigation";
import { loadLatestFocusPlan } from "../extension-history/data";

export function FocusPreview() {
  const { snapshot } = useApp();
  const userId = snapshot.membership.userId;
  const [state, setState] = useState<{ userId: string; plan: FocusPlan | null; error?: string }>();
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = () => {
      void loadLatestFocusPlan(userId).then((plan) => {
        if (!cancelled) setState({ userId, plan });
      }).catch(() => { if (!cancelled) setState({ userId, plan: null, error: "저장한 계획을 확인하지 못했어요." }); });
    };
    load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [userId]);
  const plan = state?.userId === userId ? state.plan : null;
  return <article className="extension-focus-preview" aria-label="집중 준비 요약">
    <div className="row between"><span className="focus-section-label">집중 준비</span><span className="timer-state">준비 전</span></div>
    <div className="preview-clock">{formatClock((plan?.targetFocusMinutes ?? 50) * 60)}</div>
    <h2>{plan?.title ?? "다음 집중을 준비하세요"}</h2>
    <p>{state?.userId === userId && state.error ? state.error : plan ? "웹에 저장된 계획입니다. 웹에서 시작하면 타이머가 이어집니다." : "웹에서 계획을 저장하고 집중을 시작하세요."}</p>
    {plan && <><div className="preview-meta"><span>{plan.blockingMode === 'blocklist' ? '방해 사이트 차단' : plan.blockingMode === 'allowlist' ? '허용 사이트만' : '차단 꺼짐'}</span><span>목표 {plan.goals.length}개</span></div><ul className="preview-goals" tabIndex={0} aria-label="세부 목표 목록">{plan.goals.map((goal) => <li key={goal.id}><span>{goal.name}</span><strong>{goal.minutes}분</strong></li>)}</ul></>}
    <button className="button" onClick={() => openWebApp("/focus")}>집중 계획 열기</button>
  </article>;
}
