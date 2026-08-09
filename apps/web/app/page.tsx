import Link from "next/link";
import { Brand } from "@/components/brand";
import { ChevronRight, Check, Flame } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="landing">
      <header className="public-header">
        <Brand />
        <nav className="flex items-center gap-8">
          <a href="#how" className="hover:text-blue-600 transition-colors">작동 방식</a>
          <a href="#privacy" className="hover:text-blue-600 transition-colors">개인정보</a>
          <Link className="button small ml-4" href="/onboarding">
            시작하기
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">계획을 실제 집중으로</p>
          <h1>
            미루지 않을<br />환경까지 만드세요.
          </h1>
          <p className="hero-lead">
            할 일을 적는 데서 끝나지 않습니다. 계획한 시간에는 방해 사이트를 막고, 집중 결과는 안전하게 기록합니다.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/onboarding">
              <span>무료로 시작하기</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
            <Link className="button secondary" href="/focus">
              집중 화면 보기
            </Link>
          </div>
          <p className="microcopy mt-6 block text-xs text-muted">
            Chrome 확장 프로그램과 함께 사용할 때 사이트 차단이 동작합니다.
          </p>
        </div>

        <div className="timer-preview" aria-label="집중 타이머 미리보기">
          <div className="timer-top">
            <span>FOCUS SESSION</span>
            <span className="status-dot">
              <Flame className="w-3.5 h-3.5 inline text-coral" /> 집중 중
            </span>
          </div>
          <strong>49:38</strong>
          <p>오늘의 챌린지 세션</p>
          <div className="timer-track">
            <i style={{ width: "62%" }} />
          </div>
          <div className="timer-meta">
            <span>
              차단 모드<strong>방해 사이트 3개</strong>
            </span>
            <span>
              종료 예정<strong>오후 9:20</strong>
            </span>
          </div>
        </div>
      </section>

      <section className="steps" id="how">
        <p className="eyebrow">HOW IT WORKS</p>
        <h2>집중까지 세 단계면 충분합니다.</h2>
        <div className="step-grid">
          {[
            ["01", "계획하기", "할 일, 집중 시간, 차단할 사이트를 정합니다."],
            ["02", "환경 연결", "확장 프로그램이 계획을 확인하고 차단을 준비합니다."],
            ["03", "결과 남기기", "시간이 끝나면 결과와 집중 기록을 안전하게 동기화합니다."],
          ].map(([n, t, d]) => (
            <article key={n}>
              <span>{n}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="privacy" id="privacy">
        <div>
          <p className="eyebrow">PRIVACY FIRST</p>
          <h2>
            집중을 돕되,<br />감시하지 않습니다.
          </h2>
        </div>
        <ul>
          {[
            "전체 방문 URL과 검색어를 보호자에게 공유하지 않습니다.",
            "학생이 동의한 달성 여부와 총 집중 시간만 공유합니다.",
            "AI 요약 공유는 기본적으로 꺼져 있습니다.",
          ].map((text) => (
            <li key={text}>
              <Check className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
