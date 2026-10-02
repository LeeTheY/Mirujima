import Link from "next/link";
import { userRoleSchema } from "@mirujima/contracts";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { GoogleIcon } from "@/components/icons";
import { ChevronRight, ShieldCheck, CheckCircle2 } from "lucide-react";
import { hasSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { selectRole, signInWithGoogle } from "@/features/auth/actions";
import { OAuthErrorRecovery } from "@/features/auth/oauth-error-recovery";
import { destinationAfterLogin, loginErrorMessage, safeLoginDestination } from "@/features/auth/login-destination";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = safeLoginDestination(params.next);
  let errorMessage = loginErrorMessage(params.error);
  let signedIn = false;
  if (hasSupabasePublicConfig()) {
    const supabase = await createClient();
    const user = (await supabase.auth.getUser()).data.user;
    signedIn = Boolean(user);
    if (user) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const storedRole = userRoleSchema.safeParse(profile?.role);
      if (profileError) errorMessage = loginErrorMessage("profile");
      if (storedRole.success && !profileError && params.error !== "profile") redirect(destinationAfterLogin(storedRole.data, next));
    }
  }

  return (
    <main className="onboarding">
      <OAuthErrorRecovery next={next} />
      <header className="public-header">
        <Brand />
      </header>

      {errorMessage && <div className="notice error" role="alert" aria-label="로그인 오류"><strong>로그인 확인</strong><p>{errorMessage}</p>{signedIn && <Link className="text-button" href={next ?? "/home"}>계정 정보 다시 확인</Link>}</div>}

      <section className="onboarding-hero-container">
        {/* Left Side: Dark Hero Info Card */}
        <div className="onboarding-intro-card">
          <p className="eyebrow inverse" style={{ color: "#8DB5FF", marginBottom: 12 }}>
            미루지마에 오신 것을 환영합니다
          </p>
          <h1>
            {signedIn ? (
              <>
                이제 집중 학습을<br />시작해볼까요?
              </>
            ) : (
              <>
                목표를 집중으로,<br />계정을 연결해보세요.
              </>
            )}
          </h1>
          <p className="mb-6">
            {signedIn
              ? "학습 방식을 선택하면 나에게 맞는 집중 공간으로 바로 이어집니다."
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
                <span>보호자에게 방문 URL 및 검색어를 공유하지 않습니다</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: High Contrast Action Card */}
        <div className="onboarding-action-wrap">
          {signedIn ? (
            <div className="onboarding-signed-in-panel">
              <div className="onboarding-signed-in-heading">
                <span className="card-label">READY TO FOCUS</span>
                <h2>집중 학습으로 가기</h2>
                <p>이용 방식을 한 번만 선택해 주세요.</p>
              </div>
              <div className="role-options-grid">
                <form action={selectRole}>
                  <input type="hidden" name="next" value={next ?? ""} />
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
                  <input type="hidden" name="next" value={next ?? ""} />
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
            </div>
          ) : (
            <div className="card login-panel">
              <div className="login-panel-heading">
                <span className="card-label">구글 계정 인증</span>
                <span className="badge-pill google">보안 로그인</span>
              </div>

              <h2>미루지마 계정 로그인</h2>
              <p className="login-panel-description">
                웹과 확장 프로그램에 같은 Google 계정으로 로그인해 주세요.
              </p>

              {hasSupabasePublicConfig() ? (
                <form action={signInWithGoogle}>
                  <input type="hidden" name="next" value={next ?? ""} />
                  <button className="google-auth-button" type="submit">
                    <GoogleIcon className="w-5 h-5 shrink-0" />
                    <span>Google 계정으로 로그인</span>
                  </button>
                </form>
              ) : (
                <div className="notice">
                  <strong>로컬 미리보기 모드</strong>
                  <p className="mt-1">Supabase 공개 환경변수를 설정하면 Google 로그인이 활성화됩니다.</p>
                  <Link className="text-button flex items-center gap-1 mt-3" href="/">
                    <span>서비스 소개 보기</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              )}

              <div className="login-panel-footer">
                <span>
                  <ShieldCheck aria-hidden="true" /> 간편 보안 로그인
                </span>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
