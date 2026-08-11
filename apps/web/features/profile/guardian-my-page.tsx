"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard, ShieldCheck, History, Sparkles, Award, X } from "lucide-react";
import { DashboardShell } from "../../components/dashboard-shell";
import { FamilyCodeIssuer } from "../family/family-link-panel";
import { LinkedStudentsList } from "../family/linked-students-list";
import type { LinkedStudent } from "../family/linked-students";
import { GUARDIAN_MY_CARDS } from "./guardian-my-cards";
import { MembershipStatusSummary } from "../membership/membership-status-card";
import type { MembershipStatusView } from "../membership/membership-status";
import type { WalletSummary } from "../wallet/wallet-data";
import { TopupHistoryModal } from "../wallet/topup-history-modal";

export { GUARDIAN_MY_CARDS } from "./guardian-my-cards";

interface GuardianMyPageProps {
  displayName: string;
  students: LinkedStudent[];
  studentLoadFailed: boolean;
  membershipStatus: MembershipStatusView;
  walletSummary: WalletSummary;
}

export function GuardianMyPage({ displayName, students, studentLoadFailed, membershipStatus, walletSummary }: GuardianMyPageProps) {
  const [isTopupHistoryModalOpen, setIsTopupHistoryModalOpen] = useState(false);
  const [isBenefitModalOpen, setIsBenefitModalOpen] = useState(false);
  const showConnectionHeading = GUARDIAN_MY_CARDS.find((card) => card.label === "연결 학생")?.showHeading !== false;
  return (
    <DashboardShell role="guardian" activeHref="/guardian/my">
      <div className="page-heading">
        <div>
          <p className="eyebrow">GUARDIAN MY PAGE</p>
          <h1>보호자 마이페이지</h1>
          <p>계정과 가족 연결, 포인트와 멤버십을 관리합니다.</p>
        </div>
      </div>

      <section className="settings-grid">
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
                <strong className="text-blue-600 text-sm font-extrabold block mt-1">보호자 (Guardian)</strong>
              </div>
            </div>
          </div>
        </article>

        <article className={`card membership-card membership-card-${membershipStatus.tier}`}>
          <MembershipStatusSummary membership={membershipStatus} />
          <div className="card-action-footer">
            <button
              className="button secondary full small flex items-center justify-center gap-1"
              type="button"
              onClick={() => setIsBenefitModalOpen(true)}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Premium 혜택 알아보기</span>
            </button>
            <Link className="button secondary full small text-center flex items-center justify-center" href="/membership/checkout">
              <span>{membershipStatus.tier === "premium" ? "결제 정보 확인" : "가입 / 결제 정보 확인"}</span>
            </Link>
          </div>
        </article>

        <article className="card">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="card-label">보호자 지갑</span>
              <span className="badge-pill google">ASSETS</span>
            </div>
            <div className="space-y-3">
              <div className="sub-card flex items-center justify-between" style={{ background: "#EAF2FF", borderColor: "#C9DCFF" }}>
                <div>
                  <span className="text-xs text-blue-600 font-bold block">학생 보상 가능 포인트</span>
                  <strong className="text-xl font-extrabold text-navy block mt-1">{walletSummary.topupAvailable.toLocaleString()} P</strong>
                </div>
                <ShieldCheck className="w-6 h-6 text-blue-600" />
              </div>
              <div className="sub-card flex items-center justify-between">
                <span className="text-xs text-muted font-bold">누적 지급 완료</span>
                <strong className="text-base font-extrabold text-navy">{walletSummary.guardianRewardCompleted.toLocaleString()} P</strong>
              </div>
            </div>
          </div>
          <div className="card-action-footer space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Link className="button secondary full small text-center flex items-center justify-center" href="/wallet/charge">
                포인트 충전하기
              </Link>
              <button
                type="button"
                onClick={() => setIsTopupHistoryModalOpen(true)}
                className="button secondary full small text-center flex items-center justify-center"
              >
                충전·환불 내역
              </button>
            </div>
            <Link className="button refund-action-button full small text-center flex items-center justify-center" href="/wallet/refund">
              <span>충전 포인트 환불 신청</span>
            </Link>
          </div>
        </article>

        <article className="card guardian-family-card">
          <div>
            {showConnectionHeading ? <div className="flex items-center justify-between mb-2">
              <span className="card-label">연결 학생</span>
            </div> : null}
            <FamilyCodeIssuer activeStudentCount={students.length} />
            <div className="mt-2">
              <span className="card-label mb-1.5 block">연결된 학생</span>
              <LinkedStudentsList students={students} loadFailed={studentLoadFailed} allowDisconnect />
            </div>
          </div>
        </article>

        <article className="card">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="card-label">가족 활동 요약</span>
              <span className="badge-pill inactive">동의 정보만</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="sub-card text-center">
                <span className="text-xs text-muted font-bold block">연결 학생</span>
                <strong className="text-xl font-extrabold text-navy block mt-1">{students.length}명</strong>
              </div>
              <div className="sub-card text-center">
                <span className="text-xs text-muted font-bold block">오늘 완료 목표</span>
                <strong className="text-xl font-extrabold text-navy block mt-1">0개</strong>
              </div>
            </div>
            <p className="text-xs text-muted mt-3">학생이 허용한 달성 여부와 총 집중 시간만 표시됩니다.</p>
          </div>
          <div className="card-action-footer">
            <Link className="button secondary full small" href="/guardian/history">가족 기록 보기</Link>
          </div>
        </article>

        <article className="card">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="card-label">보상 요청 관리</span>
              <span className="badge-pill inactive">대기 0건</span>
            </div>
            <h2>대기 중인 요청이 없습니다.</h2>
            <p>학생이 보상을 요청하면 이름과 요청 포인트를 확인하고 승인할 수 있습니다.</p>
            <div className="sub-card mt-4">
              <span className="text-xs text-muted font-bold block">보상 원칙</span>
              <strong className="text-navy text-sm font-extrabold block mt-1">승인한 포인트만 안전하게 예약</strong>
            </div>
          </div>
          <div className="card-action-footer">
            <Link className="button secondary full small" href="/guardian/rewards">보상 요청 확인</Link>
          </div>
        </article>
      </section>

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
