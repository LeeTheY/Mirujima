import { WalletUnavailable } from "@/features/wallet/wallet-unavailable";
import { WalletBalanceGuide } from "@/features/wallet/wallet-balance-guide";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { Sparkles, CreditCard, Wallet, Flame, Target, ChevronRight } from "lucide-react";
import { loadWalletRead } from "@/features/wallet/wallet-data";

import { requireAuthenticatedRole } from "@/features/auth/require-role";
import { loadStudentHomeData } from "@/features/profile/student-home-data";
import { formatWalletPoints } from "@/features/wallet/wallet-summary";
import { ExtensionConnectionPanel } from "@/features/extension/connection-panel";

export default async function StudentHome() {
  const { user } = await requireAuthenticatedRole("/home");
  const [walletRead, home] = await Promise.all([loadWalletRead(), loadStudentHomeData(user.id)]);
  const walletSummary = walletRead.status === "ready" ? walletRead.summary : null;
  const summary = home.history.data?.summary;
  const sessionLabels = { starting: "준비 확인 중", active: "집중 중", paused: "일시정지", "awaiting-result": "결과 선택 대기", success: "완료", failed: "미완료", cancelled: "취소" };
  return (
    <DashboardShell role="student" activeHref="/home">
      <section className="dashboard-hero">
        <div>
          <span className="hero-role-badge">학생 전용 모드</span>
          <h1>{home.displayName}님, 오늘의 집중을 시작해볼까요?</h1>
          <p>오늘의 목표를 세우고 집중 습관과 포인트 보상을 함께 만들어 보세요.</p>
        </div>
        <Link className="button light shrink-0" href="/focus">
          <Sparkles className="w-4 h-4 text-blue-600 inline" />
          <span>집중 세션 작성</span>
        </Link>
      </section>

      <ExtensionConnectionPanel />
      {home.profileFailed && <div className="notice error" role="status">계정과 기준 날짜를 확인하지 못했습니다. <Link href="/home" className="text-button">다시 조회</Link></div>}
      <section className="dashboard-grid">
        <article className="card challenge-card wide">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="card-label">오늘의 집중 챌린지</span>
              <span className="badge-pill google">자기약속 챌린지</span>
            </div>
            <h2>{home.session ? `현재 ${sessionLabels[home.session.status]}입니다.` : "오늘의 계획을 준비해 보세요."}</h2>
            <p>{home.plans === null ? "오늘 계획을 불러오지 못했습니다. 계획은 변경되지 않았습니다." : `${home.today} · 오늘 계획 ${home.plansTruncated ? "100개 이상" : `${home.plans.length}개`}`}</p>
            {home.sessionFailed && <p role="status">진행 중인 세션을 확인하지 못했습니다. 집중 화면에서 다시 확인해 주세요.</p>}
          </div>
          <div className="mt-4">
            <Link className="button full" href="/focus">
              <span>{home.session ? "진행 중인 집중으로 돌아가기" : "집중 계획 작성하기"}</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </article>

        <article className="card">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="card-label">내 지갑</span>
              <Wallet className="w-4 h-4 text-blue-600" />
            </div>
            {!walletSummary && <WalletUnavailable checkedAt={walletRead.checkedAt} />}
            <div className="wallet-box-grid">
              <div className="wallet-box">
                <span>사용 가능</span>
                <strong>{formatWalletPoints(walletSummary?.topupAvailable)}</strong>
              </div>
              <div className="wallet-box earned">
                <span>획득 포인트</span>
                <strong>{formatWalletPoints(walletSummary?.earnedAvailable)}</strong>
              </div>
            </div>
          </div>
          <WalletBalanceGuide summary={walletSummary} checkedAt={walletRead.checkedAt} />
          <Link className="button secondary full text-center flex items-center justify-center gap-2" href="/wallet/charge">
            <CreditCard className="w-4 h-4" />
            <span>포인트 충전하기</span>
          </Link>
        </article>

        <article className="card wide">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="card-label">오늘의 집중 결과</span>
              <Target className="w-4 h-4 text-blue-600" />
            </div>
            <div className="progress-card-content">
              <div className="progress-header">
                <span className="progress-percent">{summary ? `${summary.completionRate}%` : "확인 불가"}</span>
                <span className="text-xs text-muted font-semibold">{summary ? `총 ${summary.totalFocusMinutes}분 집중` : "기록 조회 필요"}</span>
              </div>
              {home.history.error && <p role="status">{home.history.error}</p>}
              <div className="progress-bar-track" aria-hidden="true">
                <div className="progress-bar-fill" style={{ width: `${summary?.completionRate ?? 0}%` }} />
              </div>
              <div className="progress-meta">
                <span>완료한 목표: {summary?.completedGoalCount ?? "확인 불가"}</span>
                <span>실행한 목표: {summary?.totalGoalCount ?? "확인 불가"}</span>
              </div>
            </div>
          </div>
        </article>

        <article className="card">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="card-label">최근 집중 세션</span>
              <Flame className="w-4 h-4 text-coral" />
            </div>
            <div className="py-6 text-center">
              {home.recent.error ? <p role="status">{home.recent.error}</p> : home.recent.data?.sessions.length ? <ul className="text-left">
                {home.recent.data.sessions.slice(0, 3).map((session) => <li key={session.sessionId}>{session.dateKey} · {session.focusMinutes}분 · {sessionLabels[session.status]}</li>)}
              </ul> : <p className="text-muted text-sm m-0">이번 주 완료된 집중 기록이 없습니다.</p>}
              <Link className="text-button" href="/history">전체 기록 보기</Link>
            </div>
          </div>
        </article>
      </section>
    </DashboardShell>
  );
}
