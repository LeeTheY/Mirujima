import { useState } from "react";
import { useApp } from "../../shared/ui/AppContext";
import type { BlockingMode, MainUI } from "../../shared/types/models";
import { ScheduleForm } from "../schedules/ScheduleForm";
import { MembershipCard } from "../membership/MembershipCard";

const STEP_TITLES = ["반가워요", "멤버십 선택", "주 화면 선택", "알림 확인", "집중 방식", "자리 비움 기준", "첫 일정", "준비 완료"];

export function Onboarding() {
  const { snapshot, run } = useApp();
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState(snapshot.settings);
  const [notificationSeen, setNotificationSeen] = useState<boolean | null>(null);
  const saveSettings = async (next = settings) => { setSettings(next); await run({ type: "SETTINGS_UPDATE", payload: next }); };
  const next = () => setStep((value) => Math.min(STEP_TITLES.length - 1, value + 1));
  const previous = () => setStep((value) => Math.max(0, value - 1));
  const finish = async () => {
    if (snapshot.membership.plan === "free" && snapshot.membership.userId) await run({ type: "MEMBERSHIP_SIGN_OUT" });
    await saveSettings({ ...settings, onboardingCompleted: true });
  };

  return <main className="onboarding">
    <div className="row between"><span className="eyebrow">{step + 1} / {STEP_TITLES.length}</span><div className="row onboarding-header-actions">{step > 0 && <button className="button ghost" onClick={previous}>뒤로가기</button>}<button className="button ghost" onClick={finish}>건너뛰기</button></div></div>
    {step === 0 && <><img className="hero-icon" src="/icons/Mirujima_Icon.png" alt="미루지마 아이콘" /><h1>계획을 실제 행동으로 바꿔볼까요?</h1><p className="page-lead">미루지마는 계획한 사이트에 집중하도록 돕고, 방해 행동과 자리 비움을 로컬에서 기록합니다.</p><button className="button" onClick={next}>시작하기</button></>}
    {step === 1 && <><h1>{STEP_TITLES[step]}</h1><p className="page-lead">건너뛰거나 Free를 고르면 로그인 없이 기존 기능을 그대로 사용합니다.</p><MembershipCard onboarding onFree={next} onActivated={next} /></>}
    {step === 2 && <><h1>{STEP_TITLES[step]}</h1><p className="page-lead">자주 사용할 화면을 골라주세요. 설정에서 언제든 바꿀 수 있어요.</p><div className="choice-grid">{(["sidepanel", "popup"] as MainUI[]).map((value) => <button key={value} className={`choice ${settings.mainUI === value ? "selected" : ""}`} onClick={() => setSettings({ ...settings, mainUI: value })}><strong>{value === "sidepanel" ? "Side Panel" : "Popup"}</strong><br/><span className="small muted">{value === "sidepanel" ? "넓고 지속적인 기본 화면" : "빠르게 여는 축약 화면"}</span></button>)}</div><button className="button" onClick={async () => { await saveSettings(); next(); }}>선택 저장</button></>}
    {step === 3 && <><h1>{STEP_TITLES[step]}</h1><p className="page-lead">Chrome과 운영체제에서 알림을 허용했는지 확인합니다.</p><button className="button" onClick={() => run({ type: "NOTIFICATION_TEST" })}>테스트 알림 보내기</button><div className="choice-grid"><button className={`choice ${notificationSeen === true ? "selected" : ""}`} onClick={() => setNotificationSeen(true)}>알림이 보였어요</button><button className={`choice ${notificationSeen === false ? "selected" : ""}`} onClick={() => setNotificationSeen(false)}>보이지 않아요</button></div>{notificationSeen === false && <div className="alert">Chrome 사이트 설정과 macOS/Windows 알림 설정에서 Chrome 알림을 허용해 주세요.</div>}<button className="button secondary" onClick={next}>다음</button></>}
    {step === 4 && <><h1>{STEP_TITLES[step]}</h1><div className="choice-grid">{(["allowlist", "blocklist"] as BlockingMode[]).map((value) => <button key={value} className={`choice ${settings.defaultBlockingMode === value ? "selected" : ""}`} onClick={() => setSettings({ ...settings, defaultBlockingMode: value })}><strong>{value === "allowlist" ? "허용 사이트만" : "방해 사이트 차단"}</strong><br/><span className="small muted">{value === "allowlist" ? "집중력이 필요할 때 추천" : "조사 범위가 넓을 때"}</span></button>)}</div><button className="button" onClick={async () => { await saveSettings(); next(); }}>다음</button></>}
    {step === 5 && <><h1>{STEP_TITLES[step]}</h1><p className="page-lead">Chrome과 시스템이 유휴 상태인 시간을 기준으로 확인 알림을 보냅니다.</p><div className="choice-grid">{([3, 5, 10] as const).map((value) => <button key={value} className={`choice ${settings.idleThresholdMinutes === value ? "selected" : ""}`} onClick={() => setSettings({ ...settings, idleThresholdMinutes: value })}>{value}분</button>)}</div><button className="button" onClick={async () => { await saveSettings(); next(); }}>다음</button></>}
    {step === 6 && <><h1>{STEP_TITLES[step]}</h1><p className="page-lead">지금 만들지 않아도 Plan 화면에서 추가할 수 있어요.</p><ScheduleForm defaultBlockingMode={settings.defaultBlockingMode} onSave={async (schedule) => { await run({ type: "SCHEDULE_CREATE", payload: schedule }); next(); }} /><button className="button ghost" onClick={next}>일정은 나중에 만들기</button></>}
    {step === 7 && <><h1>준비됐어요.</h1><p className="page-lead">Today에서 오늘 할 일을 확인하고, Plan에서 일정을 만든 뒤 Focus에서 시작하세요. 차단된 페이지에서는 이유를 남기고 잠시 허용할 수 있습니다.</p><div className="card"><strong>개인정보 원칙</strong><p className="muted small">Free는 외부 요청 없이 로컬에서 동작합니다. Premium 로그인 때만 계정과 멤버십 정보를 Supabase와 주고받습니다.</p></div><button className="button" onClick={finish}>미루지마 시작</button></>}
  </main>;
}
