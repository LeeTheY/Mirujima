import Link from "next/link";
import { userRoleSchema } from "@mirujima/contracts";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { GoogleIcon } from "@/components/icons";
import { ChevronRight, ShieldCheck, ArrowRight, CheckCircle2 } from "lucide-react";
import { hasSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { selectRole, signInWithGoogle } from "@/features/auth/actions";
import { destinationForRole } from "@/features/auth/role-routing";

export default async function OnboardingPage() {
  let signedIn = false;
  if (hasSupabasePublicConfig()) {
    const supabase = await createClient();
    const user = (await supabase.auth.getUser()).data.user;
    signedIn = Boolean(user);
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const storedRole = userRoleSchema.safeParse(profile?.role);
      if (storedRole.success) redirect(destinationForRole(storedRole.data));
    }
  }

  return (
    <main className="onboarding">
      <header className="onboarding-header">
        <Brand />
      </header>

      <section className="onboarding-hero-container">
        {/* Left Side: Dark Hero Info Card */}
        <div className="onboarding-intro-card">
          <p className="eyebrow inverse" style={{ color: "#8DB5FF", marginBottom: 12 }}>
            WELCOME TO MIRUJIMA
          </p>
          <h1>
            {signedIn ? (
              <>
                어떤 방식으로<br />시작할까요?
              </>
            ) : (
              <>
                목표를 집중으로,<br />계정을 연결해보세요.
              </>
            )}
          </h1>
          <p className="mb-6">
            {signedIn
              ? "역할은 연결 방식과 홈 화면을 결정하며 계정에 안전하게 저장됩니다."
              : "Google 계정 한 번으로 웹 대시보드와 Chrome 확장 프로그램의 집중 기록을 실시간 동기화합니다."}
          </p>

          {!signedIn && (
            <div className="space-y-3 pt-2 border-t border-white/10">
              <div className="flex items-center gap-3 text-sm text-gray-200">
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                <span>확장 프로그램 사이트 차단 및 타이머 동기화</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-200">
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                <span>안전한 6자리 코드 기반 학생-보호자 연결</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-200">
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                <span>개인정보보호: URL 및 검색어 미수집 원칙</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: High Contrast Action Card */}
        <div className="onboarding-action-wrap">
          {signedIn ? (
            <div className="role-options-grid">
              <form action={selectRole}>
                <input type="hidden" name="role" value="student" />
                <input type="hidden" name="timezone" value="Asia/Seoul" />
                <button type="submit" className="role-card">
                  <div className="role-card-badge">학생</div>
                  <strong>내 집중을 계획하고 실행하기</strong>
                  <p>집중 계획, 사이트 차단, 기록과 보상을 관리합니다.</p>
                  <ChevronRight className="role-arrow-icon" />
                </button>
              </form>

              <form action={selectRole}>
                <input type="hidden" name="role" value="guardian" />
                <input type="hidden" name="timezone" value="Asia/Seoul" />
                <button type="submit" className="role-card">
                  <div className="role-card-badge guardian">보호자</div>
                  <strong>학생의 성취를 응원하기</strong>
                  <p>동의된 집중 요약을 보고 보상 요청을 관리합니다.</p>
                  <ChevronRight className="role-arrow-icon" />
                </button>
              </form>
            </div>
          ) : (
            <div className="card login-panel p-8">
              <div className="flex items-center justify-between mb-4">
                <span className="card-label m-0">GOOGLE AUTHENTICATION</span>
                <span className="badge-pill google">보안 로그인</span>
              </div>

              <h2 className="text-navy text-2xl font-extrabold mb-2">Mirujima 계정 로그인</h2>
              <p className="text-sm text-muted mb-6">
                이메일이 아닌 Supabase 보안 사용자 ID로 웹과 확장 프로그램을 안전하게 연결합니다.
              </p>

              {hasSupabasePublicConfig() ? (
                <form action={signInWithGoogle}>
                  <button className="google-auth-button" type="submit">
                    <GoogleIcon className="w-5 h-5 shrink-0" />
                    <span>Google 계정으로 로그인</span>
                  </button>
                </form>
              ) : (
                <div className="notice">
                  <strong>로컬 미리보기 모드</strong>
                  <p className="mt-1">Supabase 공개 환경변수를 설정하면 Google 로그인이 활성화됩니다.</p>
                  <Link className="text-button flex items-center gap-1 mt-3" href="/home">
                    <span>학생 화면 미리보기</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}

              <div className="border-t border-gray-100 pt-4 mt-6 flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 inline" /> 간편 보안 로그인
                </span>
                <Link className="text-button text-xs" href="/home">
                  둘러보기 →
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
