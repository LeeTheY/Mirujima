# AGENTS.md — 미루지마(Mirujima) v3 통합 개발 명세

> 이 문서는 **미루지마(Mirujima) 전체 제품 개발을 위한 최상위 실행 명세서**다.
> 작업 에이전트는 이 문서를 제품 요구사항, 아키텍처, 데이터 모델, 보안 기준, 디자인 기준, 구현 순서, 테스트 및 회귀 방지 기준의 단일 기준점으로 사용한다.
>
> 문서 버전: `3.0`
> 기준일: `2026-08-08`
> 대상 저장소: `LeeTheY/Mirujima`
> 배포 목표: `Vercel Web/PWA + Chrome Extension Manifest V3 + Supabase`

---

## 0. 문서 적용 우선순위

이 문서는 기존 `AGENTS.md` v2를 완전히 대체한다.

충돌이 발생하면 아래 순서로 판단한다.

1. 현재 `AGENTS.md` v3
2. 현재 코드와 테스트가 증명하는 기존 동작
3. `README.md` 및 `docs/`의 기존 설명
4. 과거 AGENTS 명세

기존 기능을 변경하거나 제거해야 할 경우에는 **변경 이유, 데이터 호환성, 회귀 테스트**를 함께 남긴다. 요청과 무관한 대규모 리팩터링은 하지 않는다.

---

# 1. 제품 최종 목표

미루지마는 단순한 타이머가 아니라 다음 세 요소를 하나의 서비스로 연결하는 집중 지원 플랫폼이다.

1. **웹/PWA**
   - 계획 작성
   - 집중 시간 및 차단 사이트 설정
   - 포인트 디파짓
   - 기록/통계
   - 학생/보호자 연결
   - 결제/멤버십
   - AI 코칭
2. **Chrome Extension**
   - 웹에서 생성한 집중 계획 감지
   - 실제 카운트다운 유지
   - 사이트 차단
   - 브라우저 활동 기반 집중 상태 확인
   - Chrome/Service Worker 재시작 후 상태 복구
3. **Supabase Backend**
   - Google 로그인
   - 권한/RLS
   - 클라우드 동기화
   - 학생/보호자 관계
   - 포인트 원장
   - 알림
   - Toss Payments 승인/취소
   - AI 서버 실행

웹은 **Control Plane**, 확장 프로그램은 **Browser Enforcement Agent**, Supabase는 **Canonical Backend**로 본다.

웹 페이지를 닫아도 이미 시작된 집중 세션과 사이트 차단은 확장 프로그램에서 계속 동작해야 한다.

---

# 2. 현재 프로젝트 기준선

현재 저장소는 이미 React + TypeScript + Vite 기반 Manifest V3 Chrome Extension이며 다음 기반을 보유한다.

- Side Panel / Popup
- `chrome.storage.local`
- `chrome.alarms`
- `chrome.notifications`
- `chrome.idle`
- `chrome.declarativeNetRequest`
- allowlist / blocklist
- 집중 세션 / 휴식 / 리포트
- 탭 그룹화
- Supabase 인증/멤버십/클라우드 동기화
- AI OCR/문법/요약 기능

기존 핵심 구조를 우선 유지한다.

```text
package.json
public/manifest.json
src/background/
src/content/
src/app/
src/popup/
src/sidepanel/
src/features/
src/shared/
supabase/migrations/
supabase/functions/
```

기존 `src/shared/types/models.ts`의 `Schedule`, `FocusSession`, `DailyReport`, `UserSettings`, `DomainRule`, `BlockingMode`, `ActivityMode`, `NotificationRecord`, `FocusState`는 삭제하지 않고 additive하게 확장한다.

---

# 3. 절대 변경하지 않는 제품 원칙

## 3.1 기존 기능 보존

- 기존 확장 프로그램 기능을 가능한 한 유지한다.
- 사이트 차단은 계속 Manifest V3 DNR을 사용한다.
- 로컬 집중 기능은 서버 장애 때문에 모두 사라지지 않아야 한다.
- 기존 local storage schema 변경 시 migration을 제공한다.

## 3.2 서버가 필요한 기능

아래 기능은 서버 검증 없이 클라이언트 단독으로 확정하지 않는다.

- 포인트 충전
- 포인트 디파짓
- 획득 포인트 전환
- 보호자 포인트 지원
- 환불
- 현금화 요청
- 멤버십 활성화
- 학생/보호자 연결
- AI entitlement 판정

## 3.3 데이터베이스 변경 원칙

새 테이블 생성은 마지막 수단이다. 항상 아래 순서로 검토한다.

```text
1. 기존 column 사용
2. 기존 jsonb payload 확장
3. 기존 table에 additive column 추가
4. 기존 check constraint/enum 확장
5. RPC / View / Index 추가
6. 위 구조로 의미·무결성·보안이 깨지는 경우에만 신규 table 생성
```

신규 테이블을 추가하는 migration에는 기존 테이블로 대체될 수 없는 이유를 SQL comment 또는 migration 문서에 남긴다.

## 3.4 재무 데이터 원칙

UI의 포인트 숫자를 직접 증가/감소시키는 구현은 금지한다. 포인트는 **불변 원장(ledger)** 의 posted transaction 합산으로 계산한다.

## 3.5 개인정보 원칙

보호자에게 다음 원본 데이터를 공유하지 않는다.

- 전체 방문 URL
- 검색어
- 폼 입력값
- 페이지 본문
- 카메라 영상
- 화면 캡처 원본
- 키 입력 원문

보호자 공유 대상은 학생이 동의한 다음 집계 정보로 제한한다.

- 목표 달성 여부
- 총 집중 시간
- 계획 완료 단계
- 획득/보상 상태
- 동의된 AI 요약

---

# 4. 목표 저장소 구조

장기 목표는 npm workspaces 기반 모노레포다.

```text
Mirujima/
├─ apps/
│  ├─ web/                         # Next.js App Router + PWA + Vercel
│  │  ├─ app/
│  │  ├─ components/
│  │  ├─ features/
│  │  ├─ lib/
│  │  ├─ public/
│  │  └─ tests/
│  └─ extension/                   # 기존 Vite + React MV3
│     ├─ src/
│     ├─ public/
│     ├─ popup.html
│     ├─ sidepanel.html
│     ├─ app.html
│     └─ blocked.html
├─ packages/
│  ├─ contracts/                   # 공유 TypeScript 타입 + Zod schema
│  ├─ domain/                      # 순수 도메인 로직
│  └─ config/                      # 공유 상수 / 기능 플래그
├─ supabase/
│  ├─ migrations/
│  ├─ functions/
│  └─ tests/
├─ docs/
├─ package.json
└─ AGENTS.md
```

`src/`, `public/`, HTML entry를 `apps/extension/`으로 옮길 때 파일 이동과 기능 변경을 한 commit에서 동시에 하지 않는다. 먼저 동일 빌드 결과가 나오는 구조 이동 commit을 만든 뒤 기능 개발을 시작한다.

대규모 이동이 현재 작업 리스크를 지나치게 높이면 Extension은 일시적으로 root에 유지하고 `apps/web/`만 먼저 추가할 수 있다.

---

# 5. 기술 스택

## 5.1 Web/PWA

- Next.js App Router
- React
- TypeScript `strict: true`
- npm
- Vercel
- Supabase JS / Supabase SSR 공식 패턴
- Tailwind CSS 또는 프로젝트 전체에서 통일된 단일 스타일 시스템
- Recharts
- Zod
- Vitest
- Playwright

## 5.2 Chrome Extension

- React
- TypeScript
- Vite
- Manifest V3
- Chrome Extension API
- Vitest

기존 Extension에 무거운 상태 관리 라이브러리를 임의로 추가하지 않는다.

## 5.3 Backend

- Supabase Auth
- PostgreSQL
- RLS
- RPC
- Supabase Realtime
- Supabase Edge Functions
- Supabase Secrets

## 5.4 결제

- Toss Payments Payment Widget v2 또는 구현 시점 공식 최신 권장 방식
- Toss Payments Core API
- 자동 정기결제는 실제 계약 가능 여부 확인 후 Billing API 적용

---

# 6. 디자인 시스템

첨부된 FocusBack 예시의 **레이아웃 밀도, 카드 구조, 네이비/블루 톤, pill navigation, 넉넉한 여백**을 참고하되 브랜드는 `Mirujima`를 유지한다. FocusBack 로고/상호/문구를 복제하지 않는다.

```css
:root {
  --bg: #F6F8FC;
  --surface: #FFFFFF;
  --surface-soft: #F1F5FA;
  --text: #111827;
  --text-muted: #75839A;
  --primary: #2F6FF2;
  --primary-strong: #1F5FE5;
  --primary-soft: #EAF2FF;
  --navy: #101C32;
  --navy-soft: #18253B;
  --border: #DCE4EF;
  --success: #1FA35A;
  --success-soft: #E8F8EE;
  --danger: #FF5A5F;
  --danger-soft: #FFF0F0;
  --warning: #ECA900;
}
```

UI 규칙:

- 배경은 옅은 blue-gray.
- 카드 배경은 흰색.
- Hero는 dark navy.
- Primary action은 cobalt blue.
- 카드 radius `16~24px`.
- input/button radius `10~14px`.
- 그림자는 강하지 않은 blue-gray shadow.
- 과도한 glassmorphism/gradient 금지.
- 본문 최대 폭 약 `1120~1200px`.
- desktop은 2~3 column card grid, mobile은 1 column.

학생 기본 탭:

```text
홈 / 집중 / 기록 / 마이페이지
```

보호자 기본 탭:

```text
홈 / 학생 / 기록 / 마이페이지
```

공통 우측:

```text
알림 / 로그아웃
```

Typography:

```css
font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

---

# 7. 사용자 역할

```ts
export type UserRole = "student" | "guardian";
```

학생:

- 집중 계획 생성
- 집중 시간/사이트 차단 설정
- 자신의 포인트 디파짓
- 보호자 디파짓 요청
- 집중 실행
- 기록 확인
- 공유 설정
- 획득 포인트 현금화 요청
- 멤버십 가입 및 AI 사용

보호자:

- 여러 학생 연결
- 학생의 동의된 집계 정보 확인
- 학생 보상 요청 확인
- 보호자 포인트 충전
- 학생 계획에 포인트 예약
- 성공 시 학생에게 보상 지급
- 보상 내역 확인
- 충전 포인트 환불 요청
- 멤버십/AI 가족 요약 사용

초기 제품 기준 보호자 1명은 여러 학생과 연결 가능하고, 학생 1명은 동시에 활성 보호자 1명만 연결 가능하다.

---

# 8. Google 로그인과 온보딩

회원가입/로그인은 Supabase Auth Google OAuth를 사용한다. 웹과 Extension은 같은 Supabase 프로젝트와 같은 `auth.users.id`를 사용한다. email 문자열만으로 동일 사용자라고 판단하지 않는다.

로그인 후 `profiles.role`이 없으면 역할 선택 화면으로 이동한다.

```text
학생으로 시작
보호자로 시작
```

권한 기준은 `profiles.role`이다. 역할 선택 완료 후 학생은 학생 홈, 보호자는 보호자 홈으로 이동한다.

온보딩 디자인은 첨부 예시처럼 밝은 배경, 큰 제품 메시지, dark navy 집중 preview, blue CTA, 서비스 작동 방식 3단계, 개인정보/보호자 공유 안내를 포함한다.

---

# 9. 학생-보호자 5분 연결 코드

학생과 보호자는 **6자리 숫자 연결 코드**로 연결한다.

예:

```text
836885
남은 시간 04:56
```

규칙:

- 6자리 숫자
- 유효기간 정확히 5분
- 단일 사용
- 재발급 시 기존 pending code 즉시 무효화
- 최대 실패 입력 5회 후 잠금
- issuer당 발급 rate limit
- 이미 연결된 계정 쌍 중복 연결 금지
- 코드 원문은 DB에 장기 저장하지 않고 hash만 저장

연결 흐름:

```text
A가 코드 발급
→ B가 5분 안에 입력
→ 서버가 역할 및 code 검증
→ family link 활성화
→ 양쪽 알림 생성
→ 학생 공유 설정 초기값 적용
```

연결 해제 전 진행 중 guardian-funded focus session, reserved point, pending reward request를 검사하고 정산 후 해제한다.

---

# 10. Web ↔ Extension 연동 아키텍처

연동은 하나의 통신 수단에만 의존하지 않는다.

## 10.1 1차: Chrome external messaging

```ts
export type WebToExtensionMessage =
  | { type: "mirujima:ping"; version: 1; requestId: string }
  | {
      type: "mirujima:focus-sync-request";
      version: 1;
      requestId: string;
      scheduleId: string;
      sessionId: string;
    }
  | { type: "mirujima:get-focus-status"; version: 1; requestId: string };
```

직접 메시지에는 포인트 잔액, Toss key, server secret을 담지 않는다. Extension은 메시지를 받은 뒤 자신의 Supabase 인증으로 canonical focus session을 다시 조회한다.

Production `externally_connectable.matches`는 정확한 서비스 origin만 허용한다.

```json
{
  "externally_connectable": {
    "matches": ["https://mirujima.vercel.app/*"]
  }
}
```

개발 localhost는 dev manifest에서만 허용한다. `*.vercel.app`, `<all_urls>`를 허용하지 않는다.

`chrome.runtime.onMessageExternal`에서 반드시 검증한다.

- `sender.url` origin
- message version
- request schema
- Extension 로그인 사용자
- `scheduleId/sessionId` 소유권
- 서버 canonical session 상태

웹 message 하나만 믿고 DNR을 활성화하지 않는다.

## 10.2 2차: Supabase 동기화

```text
Web
  ↓ start session
Supabase
  ↓ Realtime / periodic resync
Extension Service Worker
  ↓
DNR + alarm + local storage
```

서버 동기화는 상태 전환 중심으로 제한한다.

- start
- pause/break
- resume
- finish
- fail/cancel
- 주요 enforcement state

카운트다운 tick을 매초 Realtime으로 보내지 않는다.

Extension 미설치 상태에서는 계획/기록/지갑/결제는 가능하지만 사이트 차단이 필요한 디파짓 집중 세션은 시작하지 않는다.

---

# 11. 집중 계획 데이터 모델

기존 `Schedule`을 제거하지 않고 additive하게 확장한다. 목표 공유 계약 예:

```ts
export interface FocusPlan {
  id: string;
  ownerUserId: string;
  title: string;
  description: string;
  dateKey: string;
  plannedStartAt: string | null;
  targetFocusMinutes: number;
  activityMode: "interactive" | "reading" | "watching" | "offline";
  blockingMode: "allowlist" | "blocklist" | "off";
  allowedDomains: DomainRule[];
  blockedDomains: DomainRule[];
  breakMinutes: number;
  priority: "low" | "medium" | "high";
  selfDepositPoints: number;
  guardianRewardRequestPoints: number;
  status: "draft" | "planned" | "ready" | "active" | "completed" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
}
```

기존 `cloud_schedules.payload`에 새 필드를 우선 저장한다.

---

# 12. 집중 세션 상태 머신

```text
planned
  ↓
ready
  ↓
starting
  ↓
active
  ↔ break/paused
  ↓
awaiting-result
  ├─ success
  └─ failed
```

```ts
export type FocusSessionStatus =
  | "starting"
  | "active"
  | "paused"
  | "awaiting-result"
  | "success"
  | "failed"
  | "cancelled";
```

집중 시작은 서버 transaction/RPC 경계에서 아래를 수행한다.

1. 계획 소유권 확인
2. 기존 active session 검사
3. Extension-required 조건 확인
4. self deposit 잔액 확인
5. guardian approved deposit 확인
6. 필요한 금액 `reserved` 이동
7. session 생성/전환
8. `startedAt`, `endsAt` 확정
9. 알림 이벤트 기록

금융 reserve 실패 시 session을 active로 만들지 않는다.

카운트다운 source of truth:

```ts
remainingMs = Math.max(0, endsAtMs - Date.now());
```

목표 시간 전에 사용자가 수동 성공 처리할 수 없다. 네트워크 일시 끊김만으로 즉시 실패시키지 않는다.

self deposit 정책:

- 성공 → reserved → earned
- 실패 → reserved → topup 반환

---

# 13. 사이트 차단

기존 DNR 기반 구현을 유지한다.

```ts
type BlockingMode = "allowlist" | "blocklist" | "off";
```

웹 집중 페이지에서 다음을 설정한다.

- 목표 집중 시간
- 허용 사이트
- 방해 사이트
- block mode
- 휴식 시간
- 우선순위
- self deposit
- guardian reward request

적용 순서:

```text
웹 plan 저장
→ cloud_schedules sync
→ 시작 RPC
→ Extension canonical plan fetch
→ hostname normalize
→ DNR session rules 생성
→ alarm 생성
→ focus 시작
```

URL 전체 대신 hostname 위주로 처리한다. Chrome이 차단할 수 없는 `chrome://` 등의 영역은 차단 가능하다고 표시하지 않는다.

---

# 14. Supabase 기존 테이블 재사용 정책

## `profiles`

기존 column에 다음을 additive하게 추가하는 것을 우선한다.

```text
role                    student | guardian
onboarding_completed    boolean
timezone                text
locale                  text
sharing_preferences     jsonb
```

## `memberships`

기존 구조를 유지하고 `billing_integration`에 `toss`를 추가한다. `activation_source`는 `toss_payment`, `toss_billing`, `admin_grant` 등을 additive하게 추가할 수 있다.

추가 후보:

```text
current_period_started_at
current_period_ends_at
cancel_at_period_end
provider_customer_key
provider_subscription_ref
```

민감 billing key는 public table에 저장하지 않는다.

## `membership_entitlements`

기존 feature key를 삭제하지 않는다. 다음을 추가할 수 있다.

```text
ai-focus-coach
ai-study-recommendation
ai-guardian-summary
ai-weekly-report
```

## `devices`

Web/PWA/Extension endpoint까지 확장한다.

```text
device_kind             extension | web | pwa
push_subscription       jsonb
extension_install_id    text
user_agent_summary      text
```

## `cloud_schedules`

새 focus plan field를 `payload`에 저장한다. 별도 `focus_plans` table을 우선 만들지 않는다.

## `cloud_settings`

`payload`에 default focus/break/block mode/domain/notification/sharing/UI preference를 저장한다.

## `cloud_focus_sessions`

`payload` 확장 예:

```text
startedAt
endsAt
targetFocusMinutes
blockingMode
extensionEnforcementState
result
selfDepositTransactionId
guardianDepositTransactionId
```

## `cloud_reports`

`earned points`, `success/failure count`, `guardian reward total`, `focus streak`, `AI summary reference`를 payload에 확장할 수 있다.

## `cloud_learning_days`

일/주/월 기록 시각화 aggregate source로 계속 사용한다.

## `sync_mutations`

기존 cloud entity mutation idempotency를 유지한다. 금융 idempotency 용도로 억지로 재사용하지 않는다.

## `ai_rate_limits`

기존 task check를 additive하게 확장한다.

```text
focus-plan-review
study-recommendation
guardian-summary
weekly-report
```

---

# 15. 허용되는 최소 신규 테이블

v3 신규 테이블은 기본적으로 아래 3개를 넘기지 않는 것을 목표로 한다.

## 15.1 `family_links`

학생-보호자 관계와 pending 5분 code를 함께 관리한다.

```sql
id uuid primary key
student_user_id uuid null
guardian_user_id uuid null
issuer_user_id uuid not null
issuer_role text not null
status text not null
code_hash text null
code_expires_at timestamptz null
failed_attempts integer not null default 0
linked_at timestamptz null
disconnected_at timestamptz null
created_at timestamptz not null
updated_at timestamptz not null
```

상태:

```text
pending
active
expired
revoked
disconnected
```

active 학생당 guardian 1명 unique partial index를 둔다. guardian은 여러 active row를 가질 수 있다.

## 15.2 `wallet_transactions`

단일 재무 원장.

```sql
id uuid primary key
kind text not null
status text not null
from_user_id uuid null
to_user_id uuid null
from_bucket text null
to_bucket text null
points bigint not null
krw_amount bigint null
schedule_id text null
session_id text null
related_transaction_id uuid null
provider text null
provider_order_id text null
provider_payment_key text null
idempotency_key text not null
metadata jsonb not null default '{}'
created_at timestamptz not null
updated_at timestamptz not null
```

financial row는 일반 client update/delete를 허용하지 않는다.

## 15.3 `notifications`

```sql
id uuid primary key
recipient_user_id uuid not null
actor_user_id uuid null
kind text not null
title text not null
body text not null
data jsonb not null default '{}'
dedupe_key text null
read_at timestamptz null
created_at timestamptz not null
```

`(recipient_user_id, dedupe_key)` unique를 활용해 이벤트 중복 알림을 방지한다.

---

# 16. RLS와 권한 모델

모든 `public` table은 RLS 활성화. `service_role`은 웹/Extension bundle에 절대 포함하지 않는다.

학생은 자기 profile/membership/cloud records/family link 안전 정보/wallet transaction/notification만 조회한다.

보호자는 연결 학생의 raw table 전체를 직접 읽지 않는다. 보호자용 RPC/view가 학생이 동의한 aggregate만 반환한다.

```text
student display name
completion status
total focus minutes
completed goal count
reward state
consented AI summary
```

raw hostname/activity heartbeat/page data는 반환하지 않는다.

`wallet_transactions`에는 authenticated client가 임의 insert/update/delete하는 정책을 만들지 않는다. 금융 mutation은 security definer RPC 또는 Edge Function만 사용하며 내부에서 `auth.uid()`를 다시 검증한다.

---

# 17. 포인트 회계 모델

기본 단위:

```text
1 P = 명목상 1 KRW
```

포인트는 integer만 사용하고 floating point를 사용하지 않는다.

```ts
export type WalletBucket = "topup" | "reserved" | "earned" | "external";
```

학생 충전:

```text
Toss 승인
external → student.topup
```

학생 self deposit:

```text
집중 시작: student.topup → student.reserved
성공:      student.reserved → student.earned
실패:      student.reserved → student.topup
```

보호자 보상:

```text
학생 reward request 생성
보호자 승인: guardian.topup → guardian.reserved
학생 성공:   guardian.reserved → student.earned
학생 실패:   guardian.reserved → guardian.topup
```

최소 transaction kind:

```text
topup_requested
topup_confirmed
self_deposit_reserved
self_deposit_earned
self_deposit_returned
guardian_reward_requested
guardian_reward_declined
guardian_deposit_reserved
guardian_reward_released
guardian_deposit_returned
topup_refund_requested
topup_refunded
cashout_requested
cashout_completed
cashout_rejected
```

잔액은 최종 posted transaction만 합산한다.

---

# 18. Toss Payments 연동

Toss client key는 client 공개 config로 취급한다. Toss secret key는 서버 secret이며 `NEXT_PUBLIC_*`, Vite client env, Extension source에 넣지 않는다.

충전 preset:

```text
10,000 P
30,000 P
50,000 P
100,000 P
300,000 P
```

결제 흐름:

```text
1. Web → 서버 topup order 생성
2. 서버 unique orderId + pending wallet transaction
3. Web → Toss Widget 결제 인증
4. successUrl에서 paymentKey/orderId/amount 수신
5. Web → Edge Function 승인 요청
6. 서버 stored order amount와 callback amount 비교
7. 서버 → Toss 승인 API
8. 승인 성공 → DB transaction/RPC로 topup posted
9. notification 생성
```

클라이언트 callback `amount`만 믿지 않는다.

멱등성:

- `orderId` unique
- `idempotency_key` unique
- 승인 API 중복 방지
- posted transition 중복 방지
- 취소 API는 제공되는 멱등성 기능 사용

보호자의 사용하지 않은 topup 환불은 가능한 경우 원 결제 Toss 취소/부분 취소로 처리한다. 환불 가능 금액은 원 결제 잔여 취소 가능 금액과 현재 topup 가용 잔액을 모두 초과할 수 없다.

학생 earned point 현금화는 일반 결제 취소와 동일하지 않다. 실제 payout provider/계약이 확인되기 전 production 자동 현금화는 feature flag로 비활성화한다.

라이브 출시 전 gate:

- Toss merchant 계약 범위 확인
- 현금화/지급 방식 확인
- 이용약관/환불정책 확정
- 미성년자 사용 가능성 검토
- 필요한 법률/회계 검토

---

# 19. 멤버십

AI 기능은 멤버십 사용자만 사용한다. UI 가격 예시는 월 `12,900원`을 사용할 수 있으나 단일 server config에서 관리하고 여러 UI에 하드코딩하지 않는다.

멤버십 혜택 예:

- AI 집중 계획 첨삭
- 맞춤 학습 과목/시간 추천
- 집중 패턴 분석
- 주간 성취 요약
- 보호자용 AI 가족 요약
- 기존 OCR/문법/콘텐츠 요약

실제 AI 실행 전 서버가 `membership_entitlements.feature_key`를 확인한다.

자동 정기결제는 Toss Billing 계약이 확인된 경우에만 추가한다. billing key는 public table/client에 노출하지 않는다.

---

# 20. AI 기능

AI는 조언/요약 기능이며 사용자 확인 없이 포인트 이동, 결제, 보상, 계획 확정을 하지 않는다.

학생 AI:

- 집중 계획 첨삭
- 목표 구체성 피드백
- 권장 집중/휴식 시간
- 목표 분할
- 최근 집중 패턴 기반 학습 순서 추천

보호자 AI 요약은 학생이 공유 동의한 aggregate만 사용한다.

금지:

- 방문 사이트 원본 나열
- 검색 내용 추측
- 감정 상태 단정
- 의학/심리 진단

서버 실행 순서:

```text
Auth 확인
→ membership 확인
→ entitlement 확인
→ rate limit 확인
→ input validation
→ 최소 데이터 구성
→ AI 호출
→ output validation
→ 결과 반환/필요 시 summary 저장
```

AI provider key는 Supabase Secret에 저장하고 클라이언트에서 직접 provider API를 호출하지 않는다.

---

# 21. 알림 시스템

알림 채널:

1. Web in-app notification center
2. PWA Web Push — 권한 허용 시
3. Chrome Extension system notification

기본 kind:

```text
family_link_code_issued
family_linked
family_disconnected
focus_plan_created
focus_plan_updated
focus_started
focus_completed
focus_failed
guardian_reward_requested
guardian_reward_approved
guardian_reward_declined
guardian_reward_released
wallet_topup_completed
wallet_refund_completed
cashout_requested
cashout_completed
membership_activated
membership_expiring
ai_summary_ready
```

Bell UI는 icon, title, 한 줄 설명, 상대 시간, unread state를 표시한다. 읽음 처리는 recipient 본인만 가능하다.

---

# 22. 기록/통계 페이지

필수 filter:

```text
일별 / 주별 / 월별
```

학생 지표:

- 목표 달성률
- 총 집중 시간
- 목표별 집중 시간
- 성공/실패 session 수
- 연속 집중 일수
- earned point
- self deposit 성공 전환율
- block attempt 수
- 시간대별 집중 분포

권장 차트:

- Line: 일별 집중 시간
- Bar: 목표별 집중 시간
- Area: 누적 집중 추세
- Donut/Radial: 달성률
- Heatmap: 시간대/요일 패턴

차트 아래에는 접근 가능한 텍스트/표 요약을 제공한다.

보호자는 연결 학생 selector로 학생별 동의 aggregate만 본다.

---

# 23. 학생 화면 명세

## `/home`

```text
[Dark Hero]
학생 이름 + 환영 문구

[오늘의 집중 챌린지]       [내 지갑]
집중 세션 시작 CTA          topup / earned

[오늘의 목표 달성률]
progress bar

[최근 활동/AI 추천]
```

## `/focus`

Plan builder:

- 계획명
- 날짜
- 목표 집중 시간
- self deposit
- guardian reward request
- 목표 목록
- 목표 설명
- 목표 시간
- 우선순위
- allowlist/blocklist
- break

CTA:

```text
계획 확정 및 집중 준비
AI 스마트 추천
```

AI CTA는 membership 미가입 시 membership modal을 연다.

Active Focus는 중앙 dark navy timer card를 사용한다.

```text
FOCUS SESSION
50:00
progress
```

함께 표시:

- 현재 목표
- 차단 모드
- Extension 상태
- self deposit
- guardian reward
- break
- 종료/포기

## `/history`

- title
- guide button
- 일/주/월 segmented control
- summary cards
- charts
- 목표 실행 결과 table/card

## `/my`

Desktop 3-column card grid:

- 로그인 계정 정보
- 멤버십
- 학습 성과 요약
- 연결 보호자 및 privacy
- 포인트 현황
- 공유 설정

---

# 24. 보호자 화면 명세

## `/guardian`

```text
[Dark Hero]
보호자 이름 + 가족 학습 지원 문구

[학생 selector]

[학생 집중 지표]            [학생에게 포인트 지원]
완료 목표                    금액 입력
총 집중 시간                 보내기/예약
획득 포인트

[AI 가족 협력 가이드]
```

학생 탭은 이름, 연결 상태, 오늘 목표, 총 집중 시간, reward request badge를 표시한다.

보호자 마이페이지 카드:

- 로그인 계정 정보
- 보호자 지갑 & points
- 멤버십
- 연결 학생
- 가족 활동 요약
- 보상 요청 관리

연결 코드 UI:

```text
연결 코드
8 3 6 8 8 5
남은 시간 04:56

[코드 재발급하기] [발급 취소]
```

---

# 25. 포인트 충전 페이지

경로 예:

```text
/wallet/charge
```

화면:

- 내 지갑으로 돌아가기
- Mirujima logo
- 포인트 충전 title
- preset cards
- 선택 금액 primary outline
- 충전 CTA
- 충전 내역

결제창은 Toss 공식 Widget을 사용한다. 결제수단 UI를 직접 흉내 내지 않는다.

---

# 26. PWA

Web은 installable PWA를 목표로 한다.

필수:

- 공식 Next.js manifest 방식
- 192 / 512 icon
- `display: standalone`
- service worker
- HTTPS production
- theme/background color

Offline 허용:

- 앱 shell
- cache된 요약 보기
- Extension에서 이미 진행 중인 집중 유지

Offline 금지:

- Toss 승인
- wallet mutation
- 학생/보호자 연결
- 현금화 확정
- membership activation
- AI 실행

금융 요청을 Service Worker background queue로 무조건 재전송하지 않는다.

---

# 27. 환경변수와 Secret

Web public env 예:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_TOSS_CLIENT_KEY
NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID
NEXT_PUBLIC_APP_ORIGIN
```

Extension public config 예:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_WEB_APP_ORIGIN
```

민감값은 Supabase Secret 우선:

```text
TOSS_SECRET_KEY
AI_PROVIDER_API_KEY
MIRUJIMA_SERVER_SIGNING_SECRET
```

브라우저 bundle 안 static `통신 키`는 추출 가능하므로 secret으로 취급하지 않는다. 실제 authorization은 exact sender origin, Supabase authenticated user, canonical session re-fetch, RLS로 수행한다.

---

# 28. Supabase Edge Function 책임

권장 function:

```text
family-link-issue
family-link-redeem
wallet-create-topup-order
wallet-confirm-topup
wallet-refund-topup
wallet-create-guardian-request
wallet-approve-guardian-request
focus-start
focus-finish
cashout-request
membership-purchase
ai-focus-coach
ai-guardian-summary
```

복수 DB write는 가능하면 SQL RPC 하나의 transaction 안에서 처리한다.

권장 RPC 책임:

```text
issue_family_link_code()
redeem_family_link_code()
start_focus_session()
finish_focus_session()
reserve_self_deposit()
reserve_guardian_deposit()
settle_focus_deposits()
post_confirmed_topup()
post_topup_refund()
create_notification()
mark_notification_read()
```

금융 RPC에는 advisory lock 또는 row lock을 사용해 race를 막는다.

---

# 29. 집중 시작 상세 흐름

```text
1. Web input validation
2. Supabase session 확인
3. Extension ping
4. Extension 설치/로그인 확인
5. focus-start Edge Function
6. plan ownership 확인
7. wallet balance 확인
8. self/guardian deposit reserve
9. cloud_focus_sessions canonical session 생성
10. startedAt/endsAt 반환
11. Web → Extension external message
12. Extension canonical session 재조회
13. DNR rule 설정
14. chrome.alarm 설정
15. local storage focus state 저장
16. Web timer 화면 전환
17. focus_started 알림
```

직접 메시지가 실패하면 Realtime/resync 경로로 같은 session을 감지한다.

---

# 30. 집중 완료 상세 흐름

성공:

```text
1. Extension timer 종료
2. DNR rule 해제
3. local result 기록
4. focus-finish 서버 호출
5. server session/time 검증
6. success 판정
7. self reserved → student earned
8. guardian reserved → student earned
9. cloud_focus_sessions 완료
10. cloud report aggregate 갱신
11. 학생 notification
12. 보호자 notification
13. Web/Extension 동기화
```

실패/포기:

```text
self reserved → self topup
guardian reserved → guardian topup
```

정산 함수는 여러 번 호출되어도 한 번만 반영되는 멱등 구조여야 한다.

---

# 31. 공유 설정

학생 마이페이지에서 보호자 공유 범위를 관리한다.

```ts
interface GuardianSharingPreferences {
  shareCompletion: boolean;
  shareTotalFocusMinutes: boolean;
  shareRewardStatus: boolean;
  shareAiSummary: boolean;
}
```

privacy-first 기본값:

```text
달성 여부           ON
총 집중 시간        ON
보상 상태           ON
AI 요약             OFF
```

AI 요약은 학생이 직접 켠 경우에만 제공한다.

---

# 32. 오류 처리

사용자에게 stack trace, Supabase raw error, secret 관련 내용을 노출하지 않는다.

UI error는 다음을 알려준다.

```text
무엇이 실패했는지
현재 데이터가 안전한지
다시 시도 가능한지
다음 행동
```

Extension 미연결:

```text
미루지마 확장 프로그램과 연결되지 않았습니다.
사이트 차단이 필요한 집중 세션을 시작하려면 확장 프로그램을 실행해주세요.
```

결제 승인 실패 시 wallet balance를 먼저 올리지 않는다.

focus 정산 실패 시 Extension local pending queue에 결과를 보존하고 reconnect 후 idempotency key로 재전송한다. 포인트를 임시 확정 표시하지 않는다.

---

# 33. 보안 요구사항

서버 경계 runtime validation 대상:

- UUID
- role
- points
- amount
- hostname
- URL origin
- focus duration
- schedule/session status
- notification payload
- AI input length

금액 규칙:

- 음수 금지
- 0P transaction 금지
- integer만 허용
- client가 `from_user_id` 임의 지정 금지
- server가 `auth.uid()`로 source account 결정

`dangerouslySetInnerHTML`은 기본 금지. AI output/goal/notification을 raw HTML로 삽입하지 않는다.

Toss success/fail callback은 저장된 order와 대조한다. OAuth/결제 redirect origin을 allowlist한다.

Rate-limit 대상:

- family code issue/redeem
- wallet order creation
- refund request
- cashout request
- AI request

---

# 34. 테스트 전략

## Unit — Vitest

- remaining time 계산
- focus state machine
- domain normalization
- wallet balance logic
- transaction validation
- notification dedupe
- sharing preference filter
- bridge message schema

## Extension

- external message origin reject
- canonical session mismatch reject
- DNR activate/deactivate
- service worker restart restore
- alarm restore
- settlement retry queue

## Web — Playwright

- Google auth 후 역할 선택 mock flow
- 학생 nav
- 보호자 nav
- focus plan creation
- Extension disconnected UX
- history filters
- wallet charge UI
- notification center
- family code flow

## Supabase SQL/RLS

- unrelated user data read 차단
- guardian unlinked student read 차단
- guardian aggregate만 조회
- client posted transaction direct write 차단
- duplicate idempotency 차단
- one active guardian per student
- code 5분 만료
- code 재사용 금지
- duplicate focus settlement 중복 reward 방지

## Toss

- amount mismatch reject
- order mismatch reject
- duplicate confirmation
- partial/full cancel mapping
- provider error handling

라이브 결제를 자동 테스트에 사용하지 않는다.

---

# 35. 기록 데이터 시각화 성능

수천 개 raw focus event를 차트용으로 브라우저에 전부 내려보내지 않는다. `cloud_learning_days`, `cloud_reports` 등의 aggregate를 활용한다.

기본 범위:

```text
일별: 최근 30일
주별: 최근 12주
월별: 최근 12개월
```

더 과거 데이터는 명시적 요청 시 pagination한다.

---

# 36. 접근성과 반응형

- button은 실제 `button` element
- tab keyboard navigation
- modal focus trap
- ESC close
- input label 연결
- 색상만으로 상태 전달 금지
- chart summary text 제공
- mobile width 320px 수준에서도 핵심 행동 가능

---

# 37. 구현 순서

## Phase 0 — 기준선

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- 기존 Extension 주요 동작 기록

## Phase 1 — Monorepo/Web Shell

- npm workspace
- 기존 Extension 구조 보존 이동
- Next.js Web
- design token
- shared contracts
- Vercel
- PWA manifest

## Phase 2 — Auth/Role

- Supabase web auth
- Google OAuth
- `profiles.role`
- onboarding
- role routing

## Phase 3 — Family Link

- `family_links`
- code issue/redeem RPC
- RLS
- notification
- 연결 UI

## Phase 4 — Focus Web + Extension Bridge

- focus plan form
- `cloud_schedules.payload` 확장
- web↔extension ping
- `externally_connectable`
- canonical focus sync
- countdown
- DNR settings web control

## Phase 5 — Wallet Ledger

- `wallet_transactions`
- balance view/RPC
- self deposit
- guardian request/reserve/release
- idempotency tests

## Phase 6 — Toss Topup/Refund

- order create
- Payment Widget
- confirm
- cancel/refund
- receipt/history

## Phase 7 — Notifications

- notifications table
- bell panel
- Realtime
- devices push subscription 확장
- PWA push
- Extension system notification mapping

## Phase 8 — History/Guardian Dashboard

- chart aggregates
- daily/weekly/monthly UI
- guardian selector
- privacy-filtered aggregate

## Phase 9 — Membership/AI

- Toss membership payment
- entitlement extension
- AI focus coach
- AI guardian summary
- rate limits

## Phase 10 — Cashout Request + Compliance Gate

- cashout request UI
- earned balance validation
- provider adapter boundary
- production feature flag
- 운영 승인 흐름

## Phase 11 — Hardening

- RLS full test
- payment failure tests
- E2E
- PWA install test
- Chrome Extension regression
- Vercel production build

---

# 38. 개발 작업 규칙

모든 기능 작업은 다음 순서를 따른다.

```text
1. 관련 기존 코드/SQL 확인
2. 기존 테스트 확인
3. 변경 데이터 흐름 정의
4. 실패 테스트 추가
5. 최소 구현
6. 테스트 통과
7. typecheck/lint
8. build
9. 회귀 확인
10. 문서 갱신
```

기존 file/function/type 이름을 임의로 바꾸지 않는다. rename이 필요하면 영향과 migration plan을 먼저 기록한다.

새 production dependency 추가 전 호환성, bundle 영향, maintenance, security, 기본 API 대체 가능 여부를 확인한다.

금융 코드 금지:

- client balance 직접 update
- optimistic posted balance
- `any`로 payment response 숨김
- 중복 confirm/webhook 무방비
- secret log 출력

---

# 39. 회귀 방지 필수 항목

웹 기능을 추가해도 기존 Extension에서 다음이 깨지면 안 된다.

- Popup
- Side Panel
- 일정 생성
- 집중 시작/일시정지/휴식/재개/종료
- DNR 차단
- 임시 허용
- alarm
- system notification
- service worker restart recovery
- daily report
- tab organizer
- Premium entitlement 기존 기능

기존 `cloud_*` schema와 sync mutation을 깨는 변경은 compatibility layer 없이 배포하지 않는다.

---

# 40. 완료 기준

## Web/PWA

- Vercel production deploy 가능
- installable PWA
- 학생/보호자 role routing
- responsive navigation
- 첨부 예시와 유사한 visual hierarchy

## Auth/Family

- Google login
- 역할 선택
- 5분 code
- guardian multi-student
- student single active guardian
- 연결/해제 알림

## Focus

- 웹에서 시간/차단 사이트 설정
- Extension 감지
- DNR 활성화
- countdown 동기화
- 웹 종료 후 Extension 지속

## Wallet

- Toss 충전
- immutable ledger
- self reserve
- guardian reserve
- success→earned
- fail→topup return
- refund 안전 처리

## AI

- membership gate
- plan review
- student recommendation
- guardian consented summary

## History

- 일/주/월 filter
- 시각화
- empty state
- guardian privacy filter

## Quality

- typecheck pass
- lint pass
- unit test pass
- SQL/RLS test pass
- E2E 핵심 flow pass
- extension build pass
- web production build pass

---

# 41. 명시적 금지 사항

1. 기존 Extension을 삭제하고 Web만 새로 만드는 것
2. 사이트 차단을 단순 화면 경고로 대체하는 것
3. 웹 페이지가 열려 있어야만 Extension focus가 유지되는 구조
4. 포인트 잔액 column을 직접 증감하는 구조
5. Toss secret을 browser env에 넣는 것
6. Supabase service role을 client에 노출하는 것
7. 보호자가 학생 전체 URL/검색어를 조회하도록 만드는 것
8. 신규 기능마다 SQL table을 하나씩 만드는 것
9. 기존 `cloud_schedules`, `cloud_focus_sessions`, `cloud_reports`를 이유 없이 폐기하는 것
10. 결제 callback amount를 서버 저장값과 비교하지 않는 것
11. cashout을 Toss payment cancel로 위장하는 것
12. Extension external message sender 검증 생략
13. Realtime으로 1초마다 countdown tick 전송
14. AI가 자동으로 결제/포인트/보상 실행
15. membership 없이 client flag만 바꿔 AI 사용
16. 금융 mutation을 offline service worker queue에서 무조건 자동 재전송
17. 동의 없이 보호자 AI summary에 비공개 activity data 포함

---

# 42. 작업 전 먼저 읽어야 할 현재 저장소 파일

```text
AGENTS.md
README.md
package.json
public/manifest.json
src/shared/types/models.ts
src/shared/types/messages.ts
src/background/*
src/features/*
supabase/migrations/202607160001_gate_a_membership.sql
supabase/migrations/202607160002_gate_b_cloud_sync.sql
supabase/migrations/202607160003_gate_c_ai_writing.sql
supabase/migrations/202607160004_gate_d_content_summary.sql
```

그 후 변경 기능과 관련된 `docs/`를 확인한다.

---

# 43. 공식 문서 기준

구현 시 블로그보다 공식 문서를 우선한다.

- Next.js App Router: `https://nextjs.org/docs/app`
- Next.js PWA: `https://nextjs.org/docs/app/guides/progressive-web-apps`
- Chrome Manifest: `https://developer.chrome.com/docs/extensions/reference/manifest`
- Chrome Messaging: `https://developer.chrome.com/docs/extensions/develop/concepts/messaging`
- Chrome externally_connectable: `https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable`
- Supabase Auth: `https://supabase.com/docs/guides/auth`
- Supabase RLS: `https://supabase.com/docs/guides/database/postgres/row-level-security`
- Supabase Realtime: `https://supabase.com/docs/guides/realtime/postgres-changes`
- Toss Payments 시작하기: `https://docs.tosspayments.com/guides/v2/get-started`
- Toss Payment Widget: `https://docs.tosspayments.com/guides/v2/payment-widget`
- Toss Core API: `https://docs.tosspayments.com/reference`
- Toss Billing API: `https://docs.tosspayments.com/guides/v2/billing/integration-api`

외부 API는 실제 구현 시 최신 공식 schema를 다시 확인한다.

---

# 44. 에이전트 최종 보고 형식

각 구현 작업 완료 후 아래 순서로 보고한다.

```text
1. 구현한 기능
2. 변경 파일
3. DB migration
4. 기존 기능 영향
5. 보안/권한 변화
6. 실행한 테스트
7. build 결과
8. 남은 production gate
```

결제 계약, 현금화 provider, 미성년자/법률 검토처럼 코드만으로 완료할 수 없는 항목은 production gate로 명시한다.

---

# 45. v3 핵심 한 문장

> **Mirujima는 웹에서 계획하고, Chrome Extension이 실제 브라우저 집중을 지키며, Supabase가 관계·기록·포인트·권한을 안전하게 관리하는 집중 플랫폼이어야 한다.**
