import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { Sparkles, ArrowRight, Wallet, Flame, Target, ChevronRight } from "lucide-react";

export default function StudentHome() {
  return (
    <DashboardShell role="student" activeHref="/home">
      <section className="dashboard-hero">
        <div>
          <span className="hero-role-badge">학생 전용 모드</span>
          <h1>반가워요! 오늘의 집중을 시작해볼까요?</h1>
          <p>오늘의 목표를 세우고 집중 습관과 포인트 보상을 함께 만들어 보세요.</p>
        </div>
        <Link className="button light shrink-0" href="/focus">
          <Sparkles className="w-4 h-4 text-blue-600 inline" />
          <span>집중 세션 작성</span>
        </Link>
      </section>

      <section className="dashboard-grid">
        <article className="card challenge-card wide">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="card-label">오늘의 집중 챌린지</span>
              <span className="badge-pill google">자기약속 챌린지</span>
            </div>
            <h2>목표를 세우고 타이머를 실행하여 내 페이스에 맞춰 공부할 수 있습니다.</h2>
            <p>방해 사이트 차단과 목표 챌린지를 설정하여 첫 세션을 준비해 보세요.</p>
          </div>
          <div className="mt-4">
            <Link className="button full" href="/focus">
              <span>집중 세션 시작하기</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </article>

        <article className="card">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="card-label">내 지갑</span>
              <Wallet className="w-4 h-4 text-blue-600" />
            </div>
            <div className="wallet-box-grid">
              <div className="wallet-box">
                <span>사용 가능</span>
                <strong>0 P</strong>
              </div>
              <div className="wallet-box earned">
                <span>획득 포인트</span>
                <strong>0 P</strong>
              </div>
            </div>
          </div>
          <Link className="button secondary full text-center flex items-center justify-center gap-1" href="/my">
            <span>포인트 충전하기</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </article>

        <article className="card wide">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="card-label">오늘의 목표 달성률</span>
              <Target className="w-4 h-4 text-blue-600" />
            </div>
            <div className="progress-card-content">
              <div className="progress-header">
                <span className="progress-percent">0%</span>
                <span className="text-xs text-muted font-semibold">진행 현황 대기</span>
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: "0%" }} />
              </div>
              <div className="progress-meta">
                <span>오늘 완료한 목표: 0개</span>
                <span>등록된 총 목표: 0개</span>
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
              <p className="text-muted text-sm m-0">아직 등록된 세션 기록이 없습니다.</p>
            </div>
          </div>
        </article>
      </section>
    </DashboardShell>
  );
}
