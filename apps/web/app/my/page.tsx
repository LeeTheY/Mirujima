"use client";

import { useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { ShieldCheck, Sparkles, UserCheck, Award, X, CreditCard, Unlink, History } from "lucide-react";
import { FamilyCodeRedeemer } from "@/features/family/family-code-redeemer";
import { MembershipStatusSummary } from "@/features/membership/membership-status-card";
import { useMembershipStatus, useProfileDisplayName, useStudentHasActiveGuardian, useWalletSummary } from "@/features/profile/profile-display-provider";
import { TopupHistoryModal } from "@/features/wallet/topup-history-modal";

export default function MyPage() {
  const displayName = useProfileDisplayName();
  const hasActiveGuardian = useStudentHasActiveGuardian();
  const membershipStatus = useMembershipStatus();
  const walletSummary = useWalletSummary();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
  const [isBenefitModalOpen, setIsBenefitModalOpen] = useState(false);
  const [isTopupHistoryModalOpen, setIsTopupHistoryModalOpen] = useState(false);

  const [shareConfig, setShareConfig] = useState({
    achievement: true,
    totalTime: true,
    aiSummary: false,
    message: true,
  });

  return (
    <DashboardShell role="student" activeHref="/my">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MY PAGE</p>
          <h1>마이페이지</h1>
          <p>계정과 집중 환경, 공유 범위를 관리합니다.</p>
        </div>
      </div>

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
            <span className="card-label mb-2">학습 성과 요약</span>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="sub-card text-center">
                <span className="text-xs text-muted font-bold block">성공 챌린지</span>
                <strong className="text-xl font-extrabold text-navy block mt-1">0회</strong>
              </div>
              <div className="sub-card text-center">
                <span className="text-xs text-muted font-bold block">누적 집중</span>
                <strong className="text-xl font-extrabold text-navy block mt-1">0분</strong>
              </div>
            </div>
            <div className="sub-card text-center mt-3" style={{ background: '#EAF2FF', borderColor: '#C9DCFF' }}>
              <span className="text-xs text-blue-600 font-bold block">누적 포인트 성과</span>
              <strong className="text-xl font-extrabold text-blue-600 block mt-1">{(walletSummary.earnedAvailable + walletSummary.cashoutCompleted).toLocaleString()} P</strong>
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
                  {hasActiveGuardian ? "보호자와 연결되어 있습니다" : "연결된 보호자가 없습니다"}
                </strong>
              </div>
              <span className="text-xs text-muted block mt-1">
                {hasActiveGuardian ? "동의한 집중 정보와 보상 상태가 공유됩니다." : "6자리 코드로 보호자와 연결할 수 있습니다."}
              </span>
            </div>
            <p className="text-xs text-muted m-0">
              방문 URL, 검색어, 카메라 원본 영상은 수집되거나 공유되지 않습니다.
            </p>
          </div>
          <div className="card-action-footer">
            {!hasActiveGuardian && <FamilyCodeRedeemer />}
            <button
              className="button secondary full small"
              type="button"
              onClick={() => setIsShareModalOpen(true)}
            >
              <span>공유 설정 관리</span>
            </button>
            {hasActiveGuardian && (
              <button
                className="disconnect-link-button"
                type="button"
                onClick={() => setIsDisconnectModalOpen(true)}
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
                  <span className="text-xs text-blue-600 font-bold block">획득 포인트 (현금 환급 가능)</span>
                  <strong className="text-lg font-extrabold text-navy block mt-1">{walletSummary.earnedAvailable.toLocaleString()} P</strong>
                </div>
                <Link className="button small" href="/wallet/cashout">
                  환급 신청
                </Link>
              </div>

              <div className="sub-card flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted font-bold block">충전 포인트 (현금화 불가)</span>
                  <span className="text-xs text-muted block mt-0.5">결제 충전 자산 (앱 내 챌린지 전용)</span>
                </div>
                <strong className="text-base font-extrabold text-navy">{walletSummary.topupAvailable.toLocaleString()} P</strong>
              </div>
            </div>
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
              <span className="badge-pill inactive">보호자 미연결</span>
            </div>
            <p className="text-xs text-muted mb-3">보호자에게 공유할 항목 설정 현황입니다.</p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="sub-card">
                <span className="text-muted block">달성 여부</span>
                <strong className="text-emerald-600 font-bold block mt-1">
                  {shareConfig.achievement ? "공유 중" : "공유 안 함"}
                </strong>
              </div>
              <div className="sub-card">
                <span className="text-muted block">총 집중 시간</span>
                <strong className="text-emerald-600 font-bold block mt-1">
                  {shareConfig.totalTime ? "공유 중" : "공유 안 함"}
                </strong>
              </div>
              <div className="sub-card">
                <span className="text-muted block">AI 결과 요약</span>
                <strong className="text-rose-500 font-bold block mt-1">
                  {shareConfig.aiSummary ? "공유 중" : "공유 안 함"}
                </strong>
              </div>
              <div className="sub-card">
                <span className="text-muted block">완료 메시지</span>
                <strong className="text-emerald-600 font-bold block mt-1">
                  {shareConfig.message ? "공유 중" : "공유 안 함"}
                </strong>
              </div>
            </div>
          </div>
          <div className="card-action-footer">
            <button
              className="button full small"
              type="button"
              onClick={() => setIsShareModalOpen(true)}
            >
              <span>공유 설정 관리</span>
            </button>
          </div>
        </article>
      </section>

      {/* Share Config Modal */}
      {isShareModalOpen && (
        <div className="modal-overlay" onClick={() => setIsShareModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-xl font-extrabold text-navy m-0">보호자 공유 범위 설정</h2>
              <button className="icon-close-button" onClick={() => setIsShareModalOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {[
                { key: "achievement", label: "집중 목표 달성 여부", desc: "집중 성공/실패 결과가 공유됩니다." },
                { key: "totalTime", label: "총 집중 시간", desc: "실제 공부한 시간 데이터만 공유됩니다." },
                { key: "aiSummary", label: "AI 집중 요약 리포트", desc: "AI가 종합한 과목 및 패턴 요약이 공유됩니다." },
                { key: "message", label: "완료 메시지", desc: "세션 완료 시 작성한 메시지가 공유됩니다." },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between sub-card">
                  <div>
                    <strong className="block text-sm text-navy">{item.label}</strong>
                    <span className="text-xs text-muted block mt-0.5">{item.desc}</span>
                  </div>
                  <button
                    type="button"
                    className={`toggle-switch-btn ${shareConfig[item.key as keyof typeof shareConfig] ? "active" : ""}`}
                    onClick={() =>
                      setShareConfig((prev) => ({
                        ...prev,
                        [item.key]: !prev[item.key as keyof typeof shareConfig],
                      }))
                    }
                  >
                    {shareConfig[item.key as keyof typeof shareConfig] ? "공유 중" : "공유 안 함"}
                  </button>
                </div>
              ))}
            </div>
            <button className="button full" type="button" onClick={() => setIsShareModalOpen(false)}>
              설정 저장 완료
            </button>
          </div>
        </div>
      )}

      {/* Disconnect Modal */}
      {isDisconnectModalOpen && (
        <div className="modal-overlay" onClick={() => setIsDisconnectModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-xl font-extrabold text-rose-600 m-0">보호자 연결 해제</h2>
              <button className="icon-close-button" onClick={() => setIsDisconnectModalOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-gray-600 m-0">
              보호자와의 연결을 해제하면 학습 공유 및 가족 보상 요청이 즉시 중단됩니다. 해제하시겠습니까?
            </p>
            <div className="flex gap-2">
              <button
                className="button secondary full"
                type="button"
                onClick={() => setIsDisconnectModalOpen(false)}
              >
                취소
              </button>
              <button
                className="button full"
                style={{ background: "#FF5A5F", borderColor: "#FF5A5F" }}
                type="button"
                onClick={() => setIsDisconnectModalOpen(false)}
              >
                연결 해제
              </button>
            </div>
          </div>
        </div>
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
