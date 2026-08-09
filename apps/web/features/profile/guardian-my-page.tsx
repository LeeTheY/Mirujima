import Link from "next/link";
import { ChevronRight, ShieldCheck, Sparkles } from "lucide-react";
import { DashboardShell } from "../../components/dashboard-shell";
import { FamilyCodeIssuer } from "../family/family-link-panel";
import { LinkedStudentsList } from "../family/linked-students-list";
import type { LinkedStudent } from "../family/linked-students";
import { GUARDIAN_MY_CARDS } from "./guardian-my-cards";

export { GUARDIAN_MY_CARDS } from "./guardian-my-cards";

interface GuardianMyPageProps {
  displayName: string;
  students: LinkedStudent[];
  studentLoadFailed: boolean;
}

export function GuardianMyPage({ displayName, students, studentLoadFailed }: GuardianMyPageProps) {
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

        <article className="card">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="card-label">멤버십 서비스</span>
              <span className="badge-pill membership">기본 이용 중</span>
            </div>
            <h2>Mirujima 서비스 이용 중</h2>
            <p>프리미엄 가입 시 학생이 동의한 가족 AI 요약과 분석을 제공합니다.</p>
          </div>
          <div className="space-y-2 mt-4">
            <div className="sub-card flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-muted">가족 협력 가이드와 주간 요약</span>
            </div>
            <Link className="button secondary full small text-center flex items-center justify-center" href="/membership/checkout">
              구독 / 결제 정보 확인
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
                  <strong className="text-lg font-extrabold text-navy block mt-1">0 P</strong>
                </div>
                <ShieldCheck className="w-5 h-5 text-blue-600" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="sub-card text-center">
                  <span className="text-xs text-muted font-bold block">예약 포인트</span>
                  <strong className="text-base font-extrabold text-navy block mt-1">0 P</strong>
                </div>
                <div className="sub-card text-center">
                  <span className="text-xs text-muted font-bold block">지급 완료</span>
                  <strong className="text-base font-extrabold text-navy block mt-1">0 P</strong>
                </div>
              </div>
            </div>
          </div>
          <Link className="text-button text-xs font-bold mt-4" href="/wallet/charge">
            <span>포인트 충전하기</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </article>

        <article className="card guardian-family-card">
          <div>
            {showConnectionHeading ? <div className="flex items-center justify-between mb-2">
              <span className="card-label">연결 학생</span>
            </div> : null}
            <FamilyCodeIssuer />
            <div className="mt-4">
              <span className="card-label mb-2">연결된 학생</span>
              <LinkedStudentsList students={students} loadFailed={studentLoadFailed} />
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
          <Link className="button secondary full small" href="/guardian/history">가족 기록 보기</Link>
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
          <Link className="button secondary full small" href="/guardian/students">보상 요청 확인</Link>
        </article>
      </section>
    </DashboardShell>
  );
}
