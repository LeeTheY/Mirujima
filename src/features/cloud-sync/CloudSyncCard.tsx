import { useState } from "react";
import { useApp } from "../../shared/ui/AppContext";
import { hasPremiumEntitlement } from "../membership/types";

export function CloudSyncCard() {
  const { snapshot, run } = useApp();
  const [busy, setBusy] = useState(false);
  if (!hasPremiumEntitlement(snapshot.membership, "cloud-sync")) return null;
  const state = snapshot.cloudSync.state;
  const action = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    try { await operation(); } catch { /* AppContext가 작업 오류를 화면 상단에 표시합니다. */ } finally { setBusy(false); }
  };
  return <article className="card cloud-sync-card">
    <div className="row between"><div><span className="eyebrow">Premium</span><h2>클라우드 동기화</h2></div><span className={`badge ${state.status === "conflict" || state.status === "offline" ? "warning" : ""}`}>{state.status === "syncing" ? "동기화 중" : state.status === "offline" ? "오프라인" : state.status === "conflict" ? "충돌 확인" : "준비됨"}</span></div>
    <p className="section-description">일정·설정·완료 세션·리포트·학습 잔디만 공유합니다. heartbeat와 탭 정보는 전송하지 않습니다.</p>
    {!state.initialized ? <div className="cloud-initial-actions"><p>이 기기의 로컬 기록을 처음 연결할 방법을 선택하세요.</p><button className="button" disabled={busy} onClick={() => void action(() => run({ type: "CLOUD_INITIAL_BACKUP" }))}>이 기기 기록 백업</button><button className="button secondary" disabled={busy} onClick={() => void action(() => run({ type: "CLOUD_RESTORE_PREVIEW" }))}>클라우드 복원 미리보기</button></div> : <div className="row"><button className="button" disabled={busy} onClick={() => void action(() => run({ type: "CLOUD_SYNC_NOW" }))}>지금 동기화</button><button className="button secondary" disabled={busy} onClick={() => void action(() => run({ type: "CLOUD_RESTORE_PREVIEW" }))}>백업에서 복원</button></div>}
    {state.restorePreview && <div className="cloud-preview"><strong>복원할 기록</strong><p>일정 {state.restorePreview.schedules}개 · 완료 세션 {state.restorePreview.focusSessions}개 · 리포트 {state.restorePreview.reports}개 · 잔디 {state.restorePreview.learningDays}일 · 삭제 기록 {state.restorePreview.deleted}개</p><button className="button" disabled={busy} onClick={() => { if (confirm("클라우드 기록을 이 기기의 로컬 기록과 병합할까요? 같은 ID는 클라우드 버전을 사용합니다.")) void action(() => run({ type: "CLOUD_RESTORE_CONFIRM" })); }}>확인 후 병합</button></div>}
    <div className="small muted">대기 {state.pendingCount}건 · 마지막 동기화 {state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString() : "없음"}</div>
    {state.conflicts.length > 0 && <div className="cloud-conflicts"><strong>직접 확인할 충돌 {state.conflicts.length}건</strong>{state.conflicts.map((conflict) => <div className="cloud-conflict" key={`${conflict.entityType}:${conflict.entityId}`}><span>{conflict.entityType} · {conflict.entityId}</span><div className="row"><button className="button secondary" disabled={busy} onClick={() => void action(() => run({ type: "CLOUD_CONFLICT_RESOLVE", entityType: conflict.entityType, entityId: conflict.entityId, resolution: "local" }))}>이 기기 버전</button><button className="button ghost" disabled={busy} onClick={() => void action(() => run({ type: "CLOUD_CONFLICT_RESOLVE", entityType: conflict.entityType, entityId: conflict.entityId, resolution: "cloud" }))}>클라우드 버전</button></div></div>)}</div>}
    {state.error && <div className="alert error" role="alert">{state.error}</div>}
  </article>;
}
