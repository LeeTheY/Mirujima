import { useState } from "react";
import { sendMessage } from "../../shared/chrome/messaging";
import { useApp } from "../../shared/ui/AppContext";
import type { BlockingMode, MainUI, UserSettings } from "../../shared/types/models";
import { MembershipCard } from "../membership/MembershipCard";
import { CloudSyncCard } from "../cloud-sync/CloudSyncCard";

export function SettingsPage() {
  const { snapshot, run } = useApp();
  const [saved, setSaved] = useState(false);
  const update = async (patch: Partial<UserSettings>) => {
    const settings = { ...snapshot.settings, ...patch };
    await run({ type: "SETTINGS_UPDATE", payload: settings });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };
  const updateTabOrganizer = async (patch: Partial<typeof snapshot.tabOrganizerSettings>) => {
    await run({ type: "TAB_ORGANIZER_SETTINGS_UPDATE", payload: { ...snapshot.tabOrganizerSettings, ...patch } });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };
  const exportData = async () => {
    const data = await sendMessage<Record<string, unknown>>({ type: "EXPORT_DATA" });
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mirujima-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return <section className="settings-page"><h1 className="page-title">설정</h1><p className="page-lead">집중 방식과 개인정보 통제를 조정합니다.</p><div className="stack settings-sections">
    {saved && <div className="alert">설정을 저장했습니다.</div>}
    <MembershipCard />
    <CloudSyncCard />
    <article className="card form-grid"><div className="field"><label htmlFor="main-ui">주 UI</label><select id="main-ui" value={snapshot.settings.mainUI} onChange={(e) => update({ mainUI: e.target.value as MainUI })}><option value="sidepanel">사이드 패널</option><option value="popup">팝업</option></select></div><div className="field"><label htmlFor="default-block">기본 차단</label><select id="default-block" value={snapshot.settings.defaultBlockingMode} onChange={(e) => update({ defaultBlockingMode: e.target.value as BlockingMode })}><option value="allowlist">허용 사이트만</option><option value="blocklist">방해 사이트만</option><option value="off">차단 끄기</option></select></div><div className="field"><label htmlFor="idle-minutes">자리 비움 기준</label><select id="idle-minutes" value={snapshot.settings.idleThresholdMinutes} onChange={(e) => update({ idleThresholdMinutes: Number(e.target.value) as 3 | 5 | 10 })}><option value="3">3분</option><option value="5">5분</option><option value="10">10분</option></select><span className="field-help">이 시간 동안 키보드·마우스 입력이 없거나 화면이 잠기면 자리 비움으로 기록하고 확인 알림을 보냅니다. 방문한 페이지 내용이나 다른 앱은 확인하지 않습니다.</span></div></article>
    <article className="card"><h2>알림과 활동</h2><p className="section-description">집중 중에는 매분 상태를 점검합니다. 시스템 알림 외에도 배지와 오늘 화면의 ‘확인할 알림’에 남습니다.</p>{([['notificationsEnabled','시스템 알림'],['distractionWarningsEnabled','집중 상태 확인 알림'],['activityHeartbeatEnabled','최소 활동 신호 사용'],['dailyReportEnabled','일일 리포트 자동 생성']] as const).map(([key, label]) => <label className="row between" key={key}><span>{label}</span><input type="checkbox" checked={snapshot.settings[key]} onChange={(e) => update({ [key]: e.target.checked })} /></label>)}<button className="button secondary" onClick={() => run({ type: "NOTIFICATION_TEST" })}>알림 테스트</button></article>
    <article className="card"><h2>스마트 탭 그룹화</h2><p className="section-description">현재 창의 탭만 로컬 규칙으로 정리합니다. 탭을 닫거나 페이지 본문·검색어·입력값을 수집하지 않습니다.</p>{([['enabled','탭 그룹화 사용'],['organizeOnFocusStart','집중 시작 시 정리 여부 묻기'],['organizeOnFocusResume','집중 재개 시 자동 정리'],['classifyNewTabsDuringFocus','집중 중 새 탭 자동 분류'],['preserveUserGroups','기존 사용자 그룹 보존'],['includePinnedTabs','고정 탭도 정리'],['rememberCorrections','분류 수정 기억']] as const).map(([key, label]) => <label className="row between" key={key}><span>{label}</span><input type="checkbox" checked={snapshot.tabOrganizerSettings[key]} onChange={(e) => void updateTabOrganizer({ [key]: e.target.checked })} /></label>)}<div className="field"><label htmlFor="restore-tabs">집중 종료 시 탭 배치</label><select id="restore-tabs" value={snapshot.tabOrganizerSettings.restoreLayoutOnFinish} onChange={(e) => void updateTabOrganizer({ restoreLayoutOnFinish: e.target.value as "ask" | "always" | "never" })}><option value="ask">매번 선택</option><option value="always">항상 복원</option><option value="never">현재 그룹 유지</option></select></div></article>
    <article className="card"><h2>저장 데이터</h2><p className="muted small">Free 데이터는 이 Chrome 프로필에만 저장됩니다. Premium 동기화에서는 구조화된 일정·설정·완료 세션·리포트·잔디만 Supabase로 전송됩니다.</p><div className="data-export-guide"><strong>JSON 내보내기는 이렇게 사용해요</strong><p>백업하거나 개발자가 기록을 점검할 때 사용하는 원본 데이터 파일입니다. 지금은 앱으로 다시 가져오는 기능이나 표 형태 변환은 제공하지 않으므로, 보관용이 아니라면 내보내지 않아도 됩니다.</p></div><div className="row"><button className="button secondary" onClick={exportData}>JSON 내보내기</button><button className="button danger" onClick={() => { if (confirm("모든 일정과 기록을 삭제하고 온보딩부터 다시 시작할까요?")) void run({ type: "CLEAR_DATA" }); }}>전체 기록 초기화</button></div></article>
    <article className="card"><h2>온보딩</h2><button className="button ghost" onClick={() => update({ onboardingCompleted: false })}>온보딩 다시 보기</button></article>
  </div></section>;
}
