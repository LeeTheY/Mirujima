import Link from "next/link";
import { Brand } from "@/components/brand";
import { ArrowIcon } from "@/components/icons";
import { hasSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { selectRole, signInWithGoogle } from "@/features/auth/actions";

export default async function OnboardingPage() {
  let signedIn = false;
  if (hasSupabasePublicConfig()) {
    const supabase = await createClient();
    signedIn = Boolean((await supabase.auth.getUser()).data.user);
  }
  return <main className="onboarding"><header><Brand /></header><section><div><p className="eyebrow">WELCOME TO MIRUJIMA</p><h1>{signedIn ? <>어떤 방식으로<br />시작할까요?</> : <>먼저 계정을<br />연결해 주세요.</>}</h1><p>{signedIn ? "역할은 연결 방식과 홈 화면을 결정하며 계정에 안전하게 저장됩니다." : "웹과 확장 프로그램은 같은 Google 계정의 사용자 ID로 집중 기록을 동기화합니다."}</p></div>{signedIn ? <div className="role-options"><form action={selectRole}><input type="hidden" name="role" value="student" /><input type="hidden" name="timezone" value="Asia/Seoul" /><button type="submit"><span>학생</span><strong>내 집중을 계획하고 실행하기</strong><p>집중 계획, 사이트 차단, 기록과 보상을 관리합니다.</p><ArrowIcon /></button></form><form action={selectRole}><input type="hidden" name="role" value="guardian" /><input type="hidden" name="timezone" value="Asia/Seoul" /><button type="submit"><span>보호자</span><strong>학생의 성취를 응원하기</strong><p>동의된 집중 요약을 보고 보상 요청을 관리합니다.</p><ArrowIcon /></button></form></div> : <div className="login-panel"><span className="card-label">GOOGLE ACCOUNT</span><h2>한 계정으로 안전하게 이어집니다.</h2><p>이메일 문자열이 아니라 Supabase 사용자 ID를 기준으로 웹과 확장 프로그램을 연결합니다.</p>{hasSupabasePublicConfig() ? <form action={signInWithGoogle}><button className="button full" type="submit">Google로 계속하기</button></form> : <div className="notice"><strong>로컬 미리보기 모드</strong><p>Supabase 공개 환경변수를 설정하면 Google 로그인이 활성화됩니다.</p><Link className="preview-link" href="/home">학생 화면 미리보기</Link></div>}</div>}</section></main>;
}
