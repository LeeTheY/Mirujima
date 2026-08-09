# Mirujima v3 Phase 0-4 Design

## Goal

기존 Chrome Extension의 local-first 집중 엔진을 유지하면서 Next.js Web/PWA, Supabase 역할·가족 연결, Web 집중 계획과 안전한 Extension bridge를 추가한다.

이번 구현은 Wallet, Toss Payments, 실제 포인트 예약·정산, AI 코칭, 전체 기록 대시보드, Push 알림을 포함하지 않는다.

## Architecture

Extension은 저장소 루트의 기존 Vite 구조를 유지한다. `apps/web`에 Next.js App Router 앱을 추가하고 `packages/contracts`에 Web과 Extension이 함께 쓰는 작은 TypeScript 계약과 런타임 검증을 둔다. 기존 Extension 파일 이동과 기능 변경을 섞지 않는다.

Web은 Control Plane, Extension은 Browser Enforcement Agent, Supabase는 canonical backend로 동작한다. Web 탭이 닫혀도 Extension의 `chrome.storage.local`, `chrome.alarms`, DNR 규칙과 Service Worker 복구 흐름이 집중 세션을 유지한다.

## Repository Shape

```text
apps/web/              Next.js App Router, auth, role UI, family UI, focus UI, PWA
packages/contracts/    role, focus plan, canonical session, bridge message 계약
src/                   기존 Extension과 최소 bridge 변경
supabase/migrations/   profiles 확장, family_links, 역할·가족·focus RPC와 RLS
supabase/functions/    family code issue/redeem 경계
```

새 상태 관리 라이브러리, repository 계층, `focus_plans_v2`, `focus_sessions_v2`, 별도 Web sync 시스템은 만들지 않는다.

## Web and PWA

Web은 Next.js App Router와 TypeScript strict를 사용한다. Supabase SSR 쿠키 세션으로 Google OAuth를 처리한다. 인증된 페이지는 서버에서 사용자를 확인하고 `profiles.role`로 학생·보호자 route를 구분한다. `raw_user_meta_data.role`은 authorization에 사용하지 않는다.

PWA는 `app/manifest.ts`, 192/512 아이콘, 작은 native service worker와 offline fallback으로 구성한다. 금융과 가족 연결 요청은 offline background queue에 넣지 않는다.

## Role and Onboarding

`profiles`에 `role`, `onboarding_completed`, `timezone`, `locale`, `sharing_preferences`를 additive하게 추가한다. 신규 사용자는 profile row가 없거나 role이 없으면 `/onboarding`으로 이동한다. 역할 변경은 본인의 아직 설정되지 않은 role만 정할 수 있는 RPC를 사용한다.

학생은 `/home`, `/focus`, `/history`, `/my`를 사용한다. 보호자는 `/guardian`, `/guardian/students`, `/guardian/history`, `/my`를 사용한다. 역할이 맞지 않는 route는 역할 홈으로 이동한다.

## Family Link

관계 무결성과 단일 사용 코드 상태를 기존 `cloud_*` payload로 안전하게 표현할 수 없으므로 AGENTS.md가 허용한 `family_links` 테이블 하나를 추가한다. 학생은 동시에 활성 보호자 한 명만 가질 수 있고 보호자는 여러 학생과 연결할 수 있다.

코드는 6자리 숫자이며 5분 후 만료된다. Edge Function은 JWT 사용자를 확인하고 `MIRUJIMA_SERVER_SIGNING_SECRET`으로 코드를 HMAC 처리하며 DB에는 원문을 저장하지 않는다. 가족 코드 RPC는 임의 hash 직접 호출을 막기 위해 `service_role` 전용으로 제한하고 Edge Function이 검증한 actor ID만 받는다. RPC는 역할, 만료, 재발급 취소, 중복 관계, 시도 횟수와 rate limit을 다시 검증한다. RLS는 관계 당사자에게 안전한 필드만 노출하고 `code_hash`는 직접 조회할 수 없게 한다.

이번 Phase에서는 알림 테이블을 만들지 않는다. 함수 응답에 후속 notification event 경계를 남긴다.

## Focus Plan and Canonical Session

새 focus plan/session 테이블을 만들지 않는다. 계획은 `cloud_schedules.payload`, canonical session은 `cloud_focus_sessions.payload`에 저장한다.

공유 `FocusPlan`은 기존 `Schedule` 필드와 호환되며 owner, priority, deposit 입력, Web 상태를 additive하게 갖는다. 포인트 입력값은 저장만 하고 잔액 변경이나 reserve를 수행하지 않는다.

`start_focus_session` RPC는 다음을 하나의 transaction에서 수행한다.

1. `auth.uid()`와 학생 역할 확인
2. plan 소유권과 payload 검증
3. 기존 active canonical session 차단
4. `startedAt`, `endsAt` 확정
5. `cloud_focus_sessions`에 active canonical payload 저장
6. Web에 session ID와 절대 종료 시각 반환

카운트다운은 항상 `Math.max(0, endsAtMs - Date.now())`로 계산한다.

## Web to Extension Bridge

Web은 다음 메시지만 Extension에 보낸다.

```ts
type WebToExtensionMessage =
  | { type: "mirujima:ping"; version: 1; requestId: string }
  | { type: "mirujima:focus-sync-request"; version: 1; requestId: string; scheduleId: string; sessionId: string }
  | { type: "mirujima:get-focus-status"; version: 1; requestId: string };
```

Production manifest의 `externally_connectable.matches`는 `https://mirujima.vercel.app/*`만 허용한다. localhost는 dev manifest 변환에서만 허용한다.

Extension의 `onMessageExternal`은 `sender.url`의 exact origin, version, request ID와 message shape를 확인한다. `focus-sync-request`를 authorization으로 신뢰하지 않고 Extension의 Supabase 세션으로 `cloud_focus_sessions`와 `cloud_schedules`를 다시 조회한다. RLS 소유권, entity ID, active 상태, 시간 유효성을 통과한 경우에만 기존 focus activation 경로를 호출한다.

## Extension Engine Reuse

기존 `message-handler`, `repository`, `blocking`, `alarms`, `bootstrap`을 재사용한다. canonical session 활성화를 위한 작은 공용 함수만 추출하고 다음 동작은 유지한다.

- local active session 저장
- 기존 schedule 호환 저장
- DNR 적용·해제
- focus-end alarm
- badge와 focus-check alarm
- Service Worker 재시작 복구
- Popup, Side Panel, Blocked 페이지 상태

`FocusSession.endsAt`은 optional additive field다. Web에서 시작한 세션은 절대 `endsAt`을 사용하고 기존 로컬 세션은 현재 누적 시간 계산을 유지한다.

## Fallback Sync

Realtime 장기 연결은 MV3 Service Worker 수명과 맞지 않으므로 초기 구현은 `chrome.alarms` periodic resync를 사용한다. Extension은 bootstrap과 1분 alarm에서 자신의 active canonical session을 확인한다. Direct message가 실패해도 다음 poll에서 같은 검증과 activation 경로를 실행한다. 1초 tick은 Supabase에 보내지 않는다.

## Error Handling

Web은 Supabase raw error나 stack trace를 표시하지 않는다. 오류에는 실패한 작업, 저장 상태, 재시도 가능 여부와 다음 행동을 포함한다.

Extension이 없거나 로그인 사용자가 다르면 차단이 적용됐다고 표시하지 않는다. canonical session 조회나 검증 실패 시 local focus와 DNR을 활성화하지 않는다. 기존 local-only 집중은 Supabase 장애와 관계없이 계속 사용할 수 있다.

## UI Direction

학생과 보호자를 위한 차분하고 신뢰감 있는 집중 제품 UI로 해석한다.

- `DESIGN_VARIANCE: 5`
- `MOTION_INTENSITY: 3`
- `VISUAL_DENSITY: 5`
- 최대 폭 1180px
- 카드 radius 20px
- 입력·버튼 radius 12px
- Pretendard와 system sans
- dark navy Hero/TimerCard, cobalt primary, blue-gray background

고유 시각 요소는 실제 집중 상태에서 사용하는 `TimerCard`다. 온보딩 preview와 Active Focus가 같은 컴포넌트를 사용한다. 과도한 gradient, glassmorphism, badge, pill, nested card를 사용하지 않는다.

현재 작업 환경에서 FocusBack 레퍼런스 원본 이미지는 발견되지 않았다. AGENTS.md에 기록된 토큰과 레이아웃 설명을 시각 기준으로 사용한다.

## Testing

Extension unit tests는 origin, malformed message, ownership/status 검증, DNR activation, absolute `endsAt`, alarm과 bootstrap 복구를 검증한다.

Web unit/component tests는 role route 결정, focus plan/domain validation, Extension 연결·미연결 상태와 countdown을 검증한다. Playwright는 학생·보호자 navigation과 핵심 폼 흐름을 검증한다.

SQL tests는 profile role, unrelated family access 차단, 보호자 다중 학생, 학생 단일 보호자, 코드 만료·단일 사용·시도 제한, schedule/session 소유권을 검증한다.

최종 검증은 Extension typecheck/lint/test/build, Web typecheck/lint/test/build, 가능한 SQL 정적 검증과 Desktop/Tablet/Mobile 브라우저 렌더 확인을 포함한다.

## Production Gates

- Supabase linked project가 dev/staging/production인지 확인되기 전 원격 migration을 적용하지 않는다.
- Google OAuth redirect URL과 provider 설정은 운영 Supabase/Vercel 설정이 필요하다.
- Production Extension ID와 정확한 Web origin을 환경변수와 manifest에 확정해야 한다.
- 실제 Chrome DNR, Service Worker restart, Web 탭 종료 acceptance flow는 unpacked Extension과 실제 Supabase 프로젝트에서 수동 검증한다.
