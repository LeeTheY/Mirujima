"use client";
import { WalletBalanceGuide } from "@/features/wallet/wallet-balance-guide";
import { useWalletCheckedAt } from "@/features/profile/profile-display-provider";
import { WalletUnavailable } from "@/features/wallet/wallet-unavailable";

import { formatWalletPoints } from "@/features/wallet/wallet-summary";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GuardianSharingPreferences } from "@mirujima/contracts";
import { Dialog } from "@/components/dialog";
import { disconnectFamilyLink, saveGuardianSharingPreferences } from "@/features/family/privacy-mutations";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { ShieldCheck, Sparkles, UserCheck, Award, X, Unlink } from "lucide-react";
import { FamilyCodeRedeemer } from "@/features/family/family-code-redeemer";
import { MembershipStatusSummary } from "@/features/membership/membership-status-card";
import { useGuardianSharingPreferences, useStudySummary, useMembershipStatus, useProfileDisplayName, useStudentHasActiveGuardian, useWalletSummary } from "@/features/profile/profile-display-provider";
import { TopupHistoryModal } from "@/features/wallet/topup-history-modal";

export default function MyPage() {
  const displayName = useProfileDisplayName();
  const hasActiveGuardian = useStudentHasActiveGuardian();
  const membershipStatus = useMembershipStatus();
  const walletSummary = useWalletSummary();
  const walletCheckedAt = useWalletCheckedAt();
  const study = useStudySummary();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
  const [isBenefitModalOpen, setIsBenefitModalOpen] = useState(false);
  const [isTopupHistoryModalOpen, setIsTopupHistoryModalOpen] = useState(false);

  const router = useRouter();
  const initialSharing = useGuardianSharingPreferences();
  const [shareConfig, setShareConfig] = useState<GuardianSharingPreferences | null>(initialSharing);
  const [shareDraft, setShareDraft] = useState<GuardianSharingPreferences | null>(null);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [privacyError, setPrivacyError] = useState("");
  const [privacyMessage, setPrivacyMessage] = useState("");
  const sharing = shareConfig ?? initialSharing;
  const openShareModal = () => {
    if (!sharing) return;
    setShareDraft({ ...sharing });
    setPrivacyError("");
    setIsShareModalOpen(true);
  };
  const sharingLabel = (key: keyof GuardianSharingPreferences) => !sharing
    ? "확인 불가" : sharing[key] ? (hasActiveGuardian === null ? "연결 확인 필요" : hasActiveGuardian ? "공유 중" : "연결 시 공유") : "공유 안 함";
  async function saveSharing() {
    if (!shareDraft || privacyBusy) return;
    setPrivacyBusy(true);
    setPrivacyError("");
    try {
      setShareConfig(await saveGuardianSharingPreferences(shareDraft));
      setIsShareModalOpen(false);
      setPrivacyMessage("공유 설정이 저장되었습니다.");
      router.refresh();
    } catch (error) { setPrivacyError(error instanceof Error ? error.message : "공유 설정을 저장하지 못했습니다."); }
    finally { setPrivacyBusy(false); }
  }
  async function disconnectGuardian() {
    if (privacyBusy) return;
    setPrivacyBusy(true);
    setPrivacyError("");
    try {
      await disconnectFamilyLink(null);
      setIsDisconnectModalOpen(false);
      setPrivacyMessage("보호자 연결이 해제되었습니다.");
      router.refresh();
    } catch (error) { setPrivacyError(error instanceof Error ? error.message : "연결을 해제하지 못했습니다."); }
    finally { setPrivacyBusy(false); }
  }

  return (
    <DashboardShell role="student" activeHref="/my">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MY PAGE</p>
          <h1>마이페이지</h1>
          <p>계정과 집중 환경, 공유 범위를 관리합니다.</p>
        </div>
      </div>

      {privacyMessage && <p className="notice" role="status">{privacyMessage}</p>}
      {!sharing && <div className="notice error" role="alert">공유 설정을 불러오지 못했습니다. 저장된 설정은 유지됩니다. <button className="button secondary small" type="button" onClick={() => router.refresh()}>다시 불러오기</button></div>}
      <Link className="button secondary small wallet-history-entry" href="/wallet/history">전체 포인트 거래 내역</Link>
      {!walletSummary && <WalletUnavailable checkedAt={walletCheckedAt} />}

      <section className="settings-grid">
        {/* Card 1: Account */}
        <article className="card">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="card-label">로그인 계정 정보</span>
              <span className="badge-pill google">Google 인증</span>
            </div>
            <div className="space-y-3 mt-1">
              <div className="sub-card">
                <span className="text-xs text-muted font-bold block">계정 상태</span>
                <strong className="text-navy text-sm font-extrabold block mt-1">Google 로그인 연결됨</strong>
              </div>
              <div className="sub-card">
                <span className="text-xs text-muted font-bold block">이름</span>
                <strong className="text-navy text-sm font-extrabold block mt-1">{displayName}</strong>
              </div>
              <div className="sub-card">
                <span className="text-xs text-muted font-bold block">계정 권한</span>
                <strong className="text-blue-600 text-sm font-extrabold block mt-1">학생 (Student)</strong>
              </div>
            </div>
          </div>
        </article>

        {/* Card 2: Membership */}
        <article className={`card membership-card membership-card-${membershipStatus.tier}`}>
          <MembershipStatusSummary membership={membershipStatus} />
          <div className="card-action-footer">
            <button
              className="button secondary full small"
              type="button"
              onClick={() => setIsBenefitModalOpen(true)}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>{membershipStatus.actionLabel}</span>
            </button>
            <Link className="button secondary full small text-center flex items-center justify-center" href="/membership/checkout">
              <span>{membershipStatus.tier === "premium" ? "결제 정보 확인" : "가입 / 결제 정보 확인"}</span>
            </Link>
          </div>
        </article>

        {/* Card 3: Performance Summary */}
        <article className="card">
          <div>
            <span className="card-label mb-2">이번 달 학습 성과</span>
            {!study && <p role="status">성과를 불러오지 못했습니다. 기록 화면에서 다시 확인해 주세요.</p>}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="sub-card text-center">
                <span className="text-xs text-muted font-bold block">성공 챌린지</span>
                <strong className="text-xl font-extrabold text-navy block mt-1">{study ? `${study.successfulSessionCount}회` : "확인 불가"}</strong>
              </div>
              <div className="sub-card text-center">
                <span className="text-xs text-muted font-bold block">이번 달 집중</span>
                <strong className="text-xl font-extrabold text-navy block mt-1">{study ? `${study.totalFocusMinutes}분` : "확인 불가"}</strong>
              </div>
            </div>
            <div className="sub-card text-center mt-3" style={{ background: '#EAF2FF', borderColor: '#C9DCFF' }}>
              <span className="text-xs text-blue-600 font-bold block">이번 달 획득 포인트</span>
              <strong className="text-xl font-extrabold text-blue-600 block mt-1">{formatWalletPoints(study?.earnedPoints)}</strong>
            </div>
          </div>
        </article>

        {/* Card 4: Guardian Link & Privacy */}
        <article className="card">
          <div>
            <span className="card-label mb-2">연결 보호자 및 프라이버시</span>
            <div className="sub-card mb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <strong className="text-navy text-sm font-extrabold">
                  {hasActiveGuardian === null ? "보호자 연결 상태를 확인하지 못했습니다" : hasActiveGuardian ? "보호자와 연결되어 있습니다" : "연결된 보호자가 없습니다"}
                </strong>
              </div>
              <span className="text-xs text-muted block mt-1">
                {hasActiveGuardian === null ? "새로고침해 연결 상태를 다시 확인해 주세요." : hasActiveGuardian ? "동의한 집중 정보와 보상 상태가 공유됩니다." : "6자리 코드로 보호자와 연결할 수 있습니다."}
              </span>
            </div>
            <p className="text-xs text-muted m-0">
              보호자에게 방문 URL, 검색어, 화면·카메라 원본을 공유하지 않습니다. 사용자가 실행하는 OCR·AI 전송 범위는 개인정보 안내에서 확인할 수 있습니다.
            </p>
          </div>
          <div className="card-action-footer">
            {hasActiveGuardian === false && <FamilyCodeRedeemer />}
            <button
              className="button secondary full small"
              type="button"
              onClick={openShareModal}
              disabled={!sharing}
            >
              <span>공유 설정 관리</span>
            </button>
            {hasActiveGuardian && (
              <button
                className="disconnect-link-button"
                type="button"
                onClick={() => { setPrivacyError(""); setIsDisconnectModalOpen(true); }}
              >
                <Unlink className="w-4 h-4" aria-hidden="true" />
                <span>보호자 연결 해제</span>
              </button>
            )}
          </div>
        </article>

        {/* Card 5: Points */}
        <article className="card">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="card-label">내 포인트 현황</span>
              <span className="badge-pill google">ASSETS</span>
            </div>
            <div className="space-y-3">
              <div className="sub-card flex items-center justify-between" style={{ background: '#EAF2FF', borderColor: '#C9DCFF' }}>
                <div>
                  <span className="text-xs text-blue-600 font-bold block">획득 포인트</span>
                  <strong className="text-lg font-extrabold text-navy block mt-1">{formatWalletPoints(walletSummary?.earnedAvailable)}</strong>
                </div>
                <Link className="button small" href="/wallet/cashout">
                  환급 신청
                </Link>
              </div>

              <div className="sub-card flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted font-bold block">충전 포인트</span>
                  <span className="text-xs text-muted block mt-0.5">앱 내 사용 · 현금화 불가</span>
                </div>
                <strong className="text-base font-extrabold text-navy">{formatWalletPoints(walletSummary?.topupAvailable)}</strong>
              </div>
            </div>
            <WalletBalanceGuide summary={walletSummary} checkedAt={walletCheckedAt} compact />
          </div>
          <div className="card-action-footer grid grid-cols-2 gap-2">
            <Link className="button secondary full small text-center flex items-center justify-center" href="/wallet/charge">
              포인트 충전하기
            </Link>
            <button
              type="button"
              onClick={() => setIsTopupHistoryModalOpen(true)}
              className="button secondary full small text-center flex items-center justify-center"
            >
              충전 내역
            </button>
          </div>
        </article>

        {/* Card 6: Sharing Overview */}
        <article className="card">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="card-label">공유 설정</span>
              <span className={`badge-pill ${hasActiveGuardian ? "google" : "inactive"}`}>{hasActiveGuardian === null ? "연결 확인 필요" : hasActiveGuardian ? "보호자 연결됨" : "보호자 미연결"}</span>
            </div>
            <p className="text-xs text-muted mb-3">보호자에게 공유할 항목 설정 현황입니다.</p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="sub-card">
                <span className="text-muted block">달성 여부</span>
                <strong className="text-emerald-600 font-bold block mt-1">
                  {sharingLabel("shareCompletion")}
                </strong>
              </div>
              <div className="sub-card">
                <span className="text-muted block">총 집중 시간</span>
                <strong className="text-emerald-600 font-bold block mt-1">
                  {sharingLabel("shareTotalFocusMinutes")}
                </strong>
              </div>
              <div className="sub-card">
                <span className="text-muted block">AI 결과 요약</span>
                <strong className="text-rose-500 font-bold block mt-1">
                  {sharingLabel("shareAiSummary")}
                </strong>
              </div>
              <div className="sub-card">
                <span className="text-muted block">보상 상태</span>
                <strong className="text-emerald-600 font-bold block mt-1">
                  {sharingLabel("shareRewardStatus")}
                </strong>
              </div>
            </div>
          </div>
          <div className="card-action-footer">
            <button
              className="button full small"
              type="button"
              onClick={openShareModal}
              disabled={!sharing}
            >
              <span>공유 설정 관리</span>
            </button>
          </div>
        </article>
      </section>

      {isShareModalOpen && shareDraft && (
        <Dialog title="보호자 공유 범위 설정" onClose={() => { if (!privacyBusy) setIsShareModalOpen(false); }}>
          <div className="space-y-3">
            {([
              { key: "shareCompletion", label: "집중 목표 달성 여부", desc: "집중 성공/실패 결과를 공유합니다." },
              { key: "shareTotalFocusMinutes", label: "총 집중 시간", desc: "집중 시간 집계만 공유합니다." },
              { key: "shareAiSummary", label: "AI 집중 요약 리포트", desc: "동의한 학습 집계의 AI 요약을 공유합니다." },
              { key: "shareRewardStatus", label: "보상 상태", desc: "포인트 보상 진행 상태를 공유합니다." },
            ] satisfies { key: keyof GuardianSharingPreferences; label: string; desc: string }[]).map((item) => (
              <div key={item.key} className="flex items-center justify-between sub-card">
                <div><strong className="block text-sm text-navy">{item.label}</strong><span className="text-xs text-muted block mt-0.5">{item.desc}</span></div>
                <button type="button" aria-label={item.label} aria-pressed={shareDraft[item.key]} disabled={privacyBusy}
                  className={`toggle-switch-btn ${shareDraft[item.key] ? "active" : ""}`}
                  onClick={() => setShareDraft((prev) => prev ? { ...prev, [item.key]: !prev[item.key] } : prev)}>
                  {shareDraft[item.key] ? "공유 중" : "공유 안 함"}
                </button>
              </div>
            ))}
          </div>
          {privacyError && <p className="notice error" role="alert">{privacyError}</p>}
          <button className="button full" type="button" onClick={() => void saveSharing()} disabled={privacyBusy}>{privacyBusy ? "저장 중…" : "공유 설정 저장"}</button>
        </Dialog>
      )}
      {isDisconnectModalOpen && (
        <Dialog title="보호자 연결 해제" onClose={() => { if (!privacyBusy) setIsDisconnectModalOpen(false); }}>
          <p className="text-sm text-gray-600 m-0">연결을 해제하면 보호자에게 집중 정보가 공유되지 않습니다. 진행 중인 보상과 예약 포인트를 먼저 정산해야 해제할 수 있습니다.</p>
          {privacyError && <p className="notice error" role="alert">{privacyError}</p>}
          <div className="flex gap-2">
            <button className="button secondary full" type="button" disabled={privacyBusy} onClick={() => setIsDisconnectModalOpen(false)}>취소</button>
            <button className="button full" style={{ background: "#FF5A5F", borderColor: "#FF5A5F" }} type="button" disabled={privacyBusy} onClick={() => void disconnectGuardian()}>{privacyBusy ? "해제 확인 중…" : "연결 해제"}</button>
          </div>
        </Dialog>
      )}

      {/* Benefit Modal */}
      {isBenefitModalOpen && (
        <div className="modal-overlay" onClick={() => setIsBenefitModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-xl font-extrabold text-navy m-0">Mirujima Premium 혜택</h2>
              <button className="icon-close-button" onClick={() => setIsBenefitModalOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="space-y-3 text-sm text-gray-600 pl-0 list-none">
              <li className="flex gap-2 items-center">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" /> AI 스마트 집중 분석 및 과목 추천
              </li>
              <li className="flex gap-2 items-center">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" /> 고급 사이트 차단 및 허용 리스트 세부 제어
              </li>
              <li className="flex gap-2 items-center">
                <Award className="w-4 h-4 text-amber-500 shrink-0" /> 가족 보상 챌린지 무제한 생성
              </li>
            </ul>
            <button className="button full" type="button" onClick={() => setIsBenefitModalOpen(false)}>
              닫기
            </button>
          </div>
        </div>
      )}

      <TopupHistoryModal
        isOpen={isTopupHistoryModalOpen}
        onClose={() => setIsTopupHistoryModalOpen(false)}
      />
    </DashboardShell>
  );
}
