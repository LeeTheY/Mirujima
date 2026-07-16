import { useState } from "react";
import { sendMessage } from "../../shared/chrome/messaging";
import { useApp } from "../../shared/ui/AppContext";
import type { OrganizeTabsResult } from "./types";
import type { TabCategory } from "../../shared/types/models";

const LABELS = { work: "🎯 현재 작업", reference: "📚 참고 자료", communication: "💬 커뮤니케이션", break: "☕ 휴식 탭", unclassified: "📦 분류 필요" } as const;

export function TabOrganizerCard() {
  const { snapshot, refresh } = useApp();
  const [result, setResult] = useState<OrganizeTabsResult | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctionCategory, setCorrectionCategory] = useState<Exclude<TabCategory, "unclassified">>("work");
  const [remember, setRemember] = useState<"once" | "schedule" | "global">("schedule");
  const session = snapshot.activeSession;
  if (!session) return null;
  const request = async (kind: "organize" | "restore") => {
    setWorking(true); setError(null);
    try {
      const message = kind === "organize" ? { type: "TAB_ORGANIZE" as const, mode: "smart" as const } : { type: "TAB_LAYOUT_RESTORE" as const, sessionId: session.id };
      setResult(await sendMessage<OrganizeTabsResult>(message));
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "탭 작업을 완료하지 못했습니다."); }
    finally { setWorking(false); }
  };
  const saveSet = async () => {
    setWorking(true); setError(null);
    try { await sendMessage({ type: "WORK_TAB_SET_SAVE", scheduleId: session.scheduleId, name: "현재 작업" }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "작업 세트를 저장하지 못했습니다."); }
    finally { setWorking(false); }
  };
  const resultCounts = result ? Object.fromEntries(result.groups.map((group) => [group.category, group.tabIds.length])) as Record<string, number> : null;
  const unclassifiedTabIds = result?.groups.find((group) => group.category === "unclassified")?.tabIds ?? [];
  const applyCorrection = async (tabId: number) => {
    setWorking(true); setError(null);
    try {
      await sendMessage({ type: "TAB_CLASSIFICATION_UPDATE", tabId, category: correctionCategory, remember });
      if (remember === "once") {
        setResult((current) => current ? { ...current, groups: current.groups.map((group) => group.category === "unclassified" ? { ...group, tabIds: group.tabIds.filter((id) => id !== tabId) } : group.category === correctionCategory ? { ...group, tabIds: [...group.tabIds, tabId] } : group) } : current);
      } else await request("organize");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "분류 수정을 적용하지 못했습니다."); }
    finally { setWorking(false); }
  };
  return <article className="card tab-organizer-card">
    <header className="focus-session-header"><div><span className="eyebrow">스마트 탭 그룹화</span><h3>현재 창 탭 정리</h3></div><span className={`badge ${snapshot.tabOrganizerSettings.enabled ? "" : "warning"}`}>{snapshot.tabOrganizerSettings.enabled ? "사용 중" : "꺼짐"}</span></header>
    <p className="section-description">일정의 허용 사이트를 최우선으로 분류하며, 고정 탭과 사용자가 만든 그룹은 기본적으로 보존합니다.</p>
    {error && <div className="action-error-banner" role="alert"><span>{error}</span><button onClick={() => setError(null)}>닫기</button></div>}
    <div className="tab-organizer-counts">{Object.entries(LABELS).map(([category, label]) => <div key={category}><span>{label}</span><strong>{resultCounts?.[category] ?? snapshot.tabOrganizerSummary.counts[category as keyof typeof snapshot.tabOrganizerSummary.counts]}</strong></div>)}</div>
    {snapshot.tabOrganizerSummary.lastOrganizedAt && <p className="muted small">최근 정리: {new Date(snapshot.tabOrganizerSummary.lastOrganizedAt).toLocaleString("ko-KR")}</p>}
    {result && result.failedTabs.length > 0 && <p className="muted small">일부 탭 {result.failedTabs.length}개는 이동하지 못했지만 나머지 정리는 계속 처리했습니다.</p>}
    {unclassifiedTabIds.map((tabId) => {
      const detail = result?.tabDetails.find((tab) => tab.tabId === tabId);
      return <div className="tab-correction-panel" key={tabId}><div className="tab-correction-identity"><strong>{detail?.hostname ?? "사이트 정보를 확인할 수 없는 탭"}</strong>{detail?.title && <span title={detail.title}>{detail.title}</span>}</div><div className="row"><select aria-label={`${detail?.hostname ?? "탭"} 분류`} value={correctionCategory} onChange={(event) => setCorrectionCategory(event.target.value as Exclude<TabCategory, "unclassified">)}><option value="work">현재 작업</option><option value="reference">참고 자료</option><option value="communication">커뮤니케이션</option><option value="break">휴식 탭</option></select><select aria-label={`${detail?.hostname ?? "탭"} 분류 기억 범위`} value={remember} onChange={(event) => setRemember(event.target.value as typeof remember)}><option value="once">이번에만</option><option value="schedule">이 일정에서 기억</option><option value="global">항상 기억</option></select><button className="button secondary" disabled={working} onClick={() => void applyCorrection(tabId)}>분류 적용</button></div></div>;
    })}
    <div className="row tab-organizer-actions"><button className="button" disabled={working || !snapshot.tabOrganizerSettings.enabled} onClick={() => void request("organize")}>{working ? "처리 중…" : "지금 탭 정리"}</button><button className="button secondary" disabled={working} onClick={() => void request("restore")}>정리 전 상태 복원</button><button className="button ghost" disabled={working} onClick={() => void saveSet()}>현재 작업 세트로 저장</button></div>
  </article>;
}
