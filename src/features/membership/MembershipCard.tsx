import { useState } from "react";
import { useApp } from "../../shared/ui/AppContext";
import { MEMBERSHIP_PRODUCT } from "./product-config";
import { PREMIUM_ENTITLEMENTS, type PremiumEntitlement } from "./types";

const LABELS: Record<PremiumEntitlement, string> = {
  "learning-grass": "학습 잔디",
  "cloud-backup": "클라우드 백업",
  "cloud-sync": "여러 PC 동기화",
  "screen-ocr": "화면 OCR",
  "grammar-correction": "AI 문법 교정",
  "content-summary": "화면 요약·학습 정리"
};

export function MembershipCard({ onboarding = false, onFree, onActivated }: {
  onboarding?: boolean;
  onFree?: () => void;
  onActivated?: () => void;
}) {
  const { snapshot, run, actionError } = useApp();
  const membership = snapshot.membership;
  const [stage, setStage] = useState<"choose" | "account" | "confirm">(membership.userId ? "confirm" : "choose");
  const [selectedPlan, setSelectedPlan] = useState<"free" | "premium">("free");
  const [busy, setBusy] = useState(false);
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); } catch { /* AppContext가 현재 화면에 표시할 작업 오류를 보존합니다. */ } finally { setBusy(false); }
  };
  const chooseFree = () => void act(async () => {
    if (membership.userId) await run({ type: "MEMBERSHIP_SIGN_OUT" });
    setStage("choose");
    onFree?.();
  });
  if (membership.plan === "premium" && membership.status === "active") {
    return <article className="card membership-card membership-card-active">
      <div className="row between"><div><span className="eyebrow">멤버십</span><h2>Premium</h2></div><div className="row"><span className="badge membership-current-badge">현재 멤버십</span><span className="badge warning">자동 갱신 없음</span></div></div>
      <p className="muted small">{membership.email}</p>
      <div className="entitlement-list">{PREMIUM_ENTITLEMENTS.map((feature) => <span key={feature} className={membership.entitlements.includes(feature) ? "entitlement enabled" : "entitlement"}>{LABELS[feature]}</span>)}</div>
      <p className="small muted">연결된 기기 {membership.deviceCount}대 · 마지막 확인 {membership.lastCheckedAt ? new Date(membership.lastCheckedAt).toLocaleString() : "없음"}</p>
      <p className="small muted">이용 종료 {membership.currentPeriodEndsAt ? new Date(membership.currentPeriodEndsAt).toLocaleString() : "확인 필요"}</p>
      <div className="row"><button className="button secondary" disabled={busy} onClick={() => void act(() => run({ type: "MEMBERSHIP_RESTORE" }))}>멤버십 다시 확인</button><button className="button ghost" disabled={busy} onClick={() => void act(() => run({ type: "MEMBERSHIP_SIGN_OUT" }))}>로그아웃</button></div>
      {(actionError || membership.error) && <div className="alert error" role="alert">{actionError || membership.error}</div>}
    </article>;
  }
  return <article className="card membership-card">
    <span className="eyebrow">멤버십</span><h2>{onboarding ? "멤버십 선택" : "Free"}</h2>
    <p>기존 일정·집중·차단·리포트는 로그인 없이 이 Chrome 프로필에 계속 저장됩니다.</p>
    {stage === "choose" && onboarding && <>
      <div className="membership-plans" role="group" aria-label="멤버십 선택">
        <button type="button" className={`membership-plan membership-plan-choice ${selectedPlan === "free" ? "selected" : ""}`} aria-pressed={selectedPlan === "free"} onClick={() => setSelectedPlan("free")}><strong>Free</strong><span>기존 로컬 집중 기능</span></button>
        <button type="button" className={`membership-plan membership-plan-choice ${selectedPlan === "premium" ? "selected" : ""}`} aria-pressed={selectedPlan === "premium"} onClick={() => setSelectedPlan("premium")}><strong>Premium · {MEMBERSHIP_PRODUCT.monthlyPriceLabel}</strong><span>잔디 · AI 교정·요약 · 여러 PC · 365일 보관</span></button>
      </div>
      <button className="button" disabled={busy} onClick={() => { if (selectedPlan === "free") chooseFree(); else void act(async () => { await run({ type: "MEMBERSHIP_CHECK_ACCOUNT" }); setStage("account"); }); }}>선택하기</button>
    </>}
    {stage === "choose" && !onboarding && <div className="membership-plans"><div className="membership-plan active" aria-current="true"><div className="row between"><strong>Free</strong><span className="badge membership-current-badge">현재 멤버십</span></div><span>기존 로컬 집중 기능</span></div><div className="membership-plan"><strong>Premium · {MEMBERSHIP_PRODUCT.monthlyPriceLabel}</strong><span>잔디 · AI 교정·요약 · 여러 PC · 365일 보관</span><button className="button" disabled={busy} onClick={() => void act(async () => { await run({ type: "MEMBERSHIP_CHECK_ACCOUNT" }); setStage("account"); })}>Premium 선택</button></div></div>}
    {stage === "account" && <div className="membership-step">
      {membership.chromeAccountEmail ? <><strong>Chrome 기본 계정</strong><span>{membership.chromeAccountEmail}</span><p className="small muted">이 계정과 같은 Google 계정으로 Supabase에 로그인합니다.</p><button className="button" disabled={busy} onClick={() => void act(async () => { await run({ type: "MEMBERSHIP_SIGN_IN" }); setStage("confirm"); })}>Google로 로그인</button></> : <><strong>Chrome 로그인 필요</strong><p>Premium은 여러 PC에서 같은 기록을 사용하기 위해 Chrome에 로그인된 Google 계정이 필요합니다.</p><button className="button secondary" disabled={busy} onClick={() => void act(() => run({ type: "MEMBERSHIP_CHECK_ACCOUNT" }))}>Chrome 로그인 후 다시 확인</button>{onboarding && <button className="button ghost" onClick={chooseFree}>Free로 계속</button>}</>}
    </div>}
    {stage === "confirm" && <div className="membership-step">
      <strong>Premium {MEMBERSHIP_PRODUCT.monthlyPriceLabel}</strong><p>같은 Google 계정으로 여러 PC에서 기록을 사용하고, 학습 잔디와 AI 문법 교정·화면 요약·학습 정리를 이용할 수 있습니다.</p><div className="alert">테스트 결제이며 실제 청구되지 않습니다. 1개월 단건 결제로 자동 갱신되지 않습니다.</div><button className="button" disabled={busy} onClick={() => void act(() => run({ type: "MEMBERSHIP_OPEN_CHECKOUT" }))}>Toss 테스트 결제 열기</button><button className="button secondary" disabled={busy} onClick={() => void act(async () => { await run({ type: "MEMBERSHIP_RESTORE" }); onActivated?.(); })}>결제 후 멤버십 확인</button><button className="button ghost" disabled={busy} onClick={chooseFree}>Free로 변경</button>
    </div>}
    {(actionError || membership.error) && <div className="alert error" role="alert">{actionError || membership.error}</div>}
  </article>;
}
