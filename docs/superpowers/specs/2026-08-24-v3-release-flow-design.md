# Mirujima v3 단계 2~8 출시 준비 설계

기준일: 2026-08-24
대상 브랜치: `feat/complete-v3-release-flow`

## 1. 목적

이미 구현된 Mirujima Web/PWA, Chrome Extension, Supabase 기능을 실제 배포 직전 수준으로 연결하고 검증한다. 단계 2부터 8까지 한 번의 연속 개발 프로그램으로 수행하되, 각 단계는 독립 작업 패키지·커밋·검증 게이트를 가진다. 마스터 계획은 작업 패키지별 세부 태스크를 분리하며, 한 단계의 필수 검증이 실패하면 다음 단계로 진행하지 않는다.

최종 사용자 흐름은 다음과 같다.

```text
학생 계획 생성
→ canonical 집중 시작
→ Extension 차단·타이머 유지
→ 목표 결과 및 포인트 정산
→ 학생 기록 조회
→ 보호자에게 동의된 집계와 보상 상태 제공
→ Web·Extension 알림
→ 멤버십 사용자의 AI 코칭
→ PWA 및 장애 복구
```

## 2. 확정된 제약

- 실제 Toss 운영 결제, 자동 정기결제, 현금 지급은 범위에서 제외한다.
- Toss는 API 개별 연동 테스트 키와 테스트 결제만 허용한다.
- 실제 Vercel 배포와 Chrome Web Store 등록은 수행하지 않는다.
- 사용자의 실제 학생·보호자 계정이나 인증 정보를 개발 선행 조건으로 요구하지 않는다.
- 인증이 필요한 실제 계정 E2E는 환경변수가 있을 때만 자동 실행하고, 없으면 수동 smoke 체크리스트로 검증한다.
- 단계별 마이그레이션과 Edge Function은 테스트 통과 후 현재 연결된 Supabase 개발 프로젝트에 적용·배포한다.
- 신규 테이블은 AGENTS.md v3에서 허용한 `notifications`만 추가한다.
- 기존 기능과 로컬 우선 Extension 동작을 보존한다.

## 3. 현재 기준선

이미 존재하는 구현은 재작성하지 않고 검증 후 보강한다.

- canonical 집중 시작·조회·일시정지·재개·완료 RPC
- Extension external message origin 검증과 canonical 재조회
- Extension 1분 주기 resync, startup bootstrap, pending settlement queue
- DNR 차단, alarm, local storage 복구
- 학생·보호자 기록 RPC와 Web 기록 화면
- 가족 연결, wallet ledger, self deposit, guardian deposit 정산 기반
- Toss 테스트 충전·멤버십·환불 Edge Function과 화면
- membership entitlement와 `ai-writing` 기반 AI 기능
- Extension 시스템 알림
- Web 알림 센터 UI 골격
- PWA manifest, 아이콘, service worker 등록

확인된 주요 누락은 다음과 같다.

- Playwright와 반복 가능한 전체 흐름 E2E 부재
- Web Realtime UI 갱신과 Extension 중복·오래된 이벤트 경계 부족
- Web 알림 센터가 서버 데이터와 연결되지 않음
- `notifications` 서버 모델과 읽음 RPC 부재
- 보호자 보상 요청 관리 UI가 정적 상태
- 결제·환불 흐름의 브라우저 E2E와 출시 차단 검사 부족
- AI 기능별 서버 계약·출력 검증·실패 격리 보강 필요
- PWA offline 범위와 금융 mutation 차단 회귀 테스트 부족

## 4. 전체 실행 전략

단일 통합 브랜치에서 아래 순서를 고정한다.

```text
2. E2E 기반
→ 3. Web↔Extension 복구 동기화
→ 4. 서버 알림
→ 5. 보호자 보상
→ 6. Toss 테스트 결제 신뢰성
→ 7. 멤버십 AI 코칭
→ 8. PWA·출시 준비
```

각 단계의 공통 게이트:

1. 순수 로직과 계약 Vitest
2. Extension·Web typecheck와 ESLint
3. 관련 pgTAP
4. Extension·Next.js production build
5. `supabase db push --dry-run`
6. 연결 프로젝트 migration 적용
7. `supabase db lint --linked --level warning`
8. 관련 Edge Function 배포 및 safe smoke test
9. 단계별 커밋

pgTAP은 Supabase SQL Editor에서 실행할 수 있는 독립 파일로 유지한다. 테스트는 `begin`과 `rollback`으로 감싸 개발 프로젝트에 fixture를 남기지 않는다.

## 5. 단계 2 — E2E 검증 기반

### 목표

기능 개발 이후 3~8단계를 같은 방식으로 검증할 수 있는 Playwright 기반을 만든다.

### 설계

- `apps/web`에 Playwright 설정과 `e2e/`를 추가한다.
- 공개 페이지, 로그인 redirect, 역할별 route 차단은 계정 없이 항상 실행한다.
- 인증 흐름은 `E2E_STUDENT_STORAGE_STATE`, `E2E_GUARDIAN_STORAGE_STATE` 또는 전용 E2E 계정 환경변수가 있을 때만 실행한다.
- 인증 정보와 storage state는 Git에 포함하지 않는다.
- 인증 테스트가 비활성화된 경우 테스트 전체를 성공 처리하지 않고 명시적으로 skipped로 보고한다.
- 실제 Google OAuth provider 화면은 자동화하지 않고 수동 smoke 항목으로 둔다.
- canonical RPC와 화면 데이터 계층은 주입 가능한 client를 유지해 계정 없이도 계약·오류·상태 전환을 테스트한다.

### 필수 시나리오

- 미인증 사용자의 학생·보호자 route 차단
- 잘못된 역할의 route 차단
- 계획 입력 validation
- 집중 시작 실패 시 UI 안전 상태
- 완료 기록 응답과 일·주·월 query
- 보호자 비공개 값이 `0`이 아닌 `공유 안 함`으로 표시
- 새로고침 후 서버 상태 복구

### 완료 기준

- Playwright config가 CI와 macOS에서 동일하게 동작한다.
- 계정 없는 기본 suite와 선택적 인증 suite가 분리된다.
- 테스트 결과가 skip 이유를 명확히 출력한다.

## 6. 단계 3 — Web↔Extension 복구 동기화

### 아키텍처

MV3 Service Worker는 항상 살아 있지 않으므로 Realtime 단독 구독을 source of truth로 사용하지 않는다.

```text
Web start RPC
→ external message 즉시 전달
→ Extension canonical session 재조회
→ DNR + alarm + local state

직접 메시지 실패 또는 worker 재시작
→ startup/alarm periodic resync
→ canonical session 재조회
→ local runtime 재구성
```

Web은 Supabase Realtime을 사용해 화면 상태를 빠르게 갱신할 수 있지만 Extension은 외부 메시지와 주기적 재조정을 기본 경로로 유지한다.

### 보강 범위

- message `version`, `requestId`, sender origin, 로그인 사용자, session ownership을 계속 검증한다.
- 동일 `requestId`와 동일 session transition을 중복 적용하지 않는다.
- local session보다 오래된 canonical payload를 적용하지 않는다.
- 로그인 사용자가 바뀌면 기존 canonical runtime과 DNR을 안전하게 정리한다.
- startup에서 pending settlement를 먼저 재시도한 뒤 현재 session을 복구한다.
- terminal session 이후 alarm, DNR, badge, temporary allow를 모두 제거한다.
- Realtime 또는 resync 오류는 local 집중을 즉시 실패시키지 않는다.

### 완료 기준

- 웹을 닫아도 Extension 타이머와 차단이 유지된다.
- worker·Chrome 재시작 후 active/paused/awaiting-result가 복구된다.
- external message 실패 후 1분 이내 resync된다.
- 중복 이벤트가 정산·알람·DNR을 중복 생성하지 않는다.

## 7. 단계 4 — 서버 알림 시스템

### 데이터 모델

허용된 세 번째 신규 테이블 `public.notifications`를 추가한다.

```text
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

- `(recipient_user_id, dedupe_key)` partial unique index로 중복을 막는다.
- recipient 본인만 select와 읽음 처리가 가능하다.
- 일반 client insert/update/delete는 허용하지 않는다.
- 생성은 transaction 내부 helper RPC만 사용한다.
- `data`는 navigation ID와 집계 상태만 포함하며 URL·검색어·활동 원본을 금지한다.

### RPC와 UI

- `list_notifications(limit, before)`
- `mark_notification_read(id)`
- `mark_all_notifications_read()`
- unread count 조회
- Web 알림 센터를 실제 서버 결과에 연결
- 상대 시간, 전체·미읽음·가족 필터 제공
- 임의 삭제 UI는 제거한다. 재무·가족 이벤트 감사 기록을 client가 삭제하지 않는다.
- 필요한 이벤트는 Extension 시스템 알림으로도 표시하되 `dedupe_key`를 기준으로 중복을 피한다.

### 생성 이벤트

- family linked/disconnected
- focus started/completed/failed
- guardian reward requested/approved/declined/released/returned
- wallet topup/refund
- membership activated/expiring
- AI summary ready

## 8. 단계 5 — 보호자 보상과 원장

### 흐름

```text
학생 보상 요청
→ guardian_reward_requested 원장 이벤트
→ 보호자 알림·요청 목록
→ 보호자 승인
→ guardian.topup → guardian.reserved
→ 집중 성공: guardian.reserved → student.earned
→ 집중 실패·취소: guardian.reserved → guardian.topup
```

### 서버 경계

- 연결된 학생·보호자 역할을 서버에서 재검증한다.
- 요청·승인·거절·정산은 idempotency key를 요구한다.
- 승인 시 guardian balance와 active link를 transaction 안에서 다시 확인한다.
- 동일 요청 ID에 advisory transaction lock을 먼저 획득하고, 이어서 guardian 원장 기준 row를 잠가 동시 승인을 직렬화한다.
- 완료된 요청의 상태를 일반 client가 변경할 수 없다.
- 연결 해제 전 reserved deposit과 pending request를 검사한다.
- 잔액은 posted ledger 합으로만 계산한다.

### Web

- 학생 계획 builder에서 guardian reward 요청 상태 표시
- 보호자 요청 목록, 승인·거절, 잔액 부족 오류, 이미 처리됨 상태
- 학생·보호자 지갑과 기록 화면 동기화
- 서버 원문 오류와 내부 transaction ID를 노출하지 않는다.

## 9. 단계 6 — Toss 테스트 결제 신뢰성

### 범위

- 테스트 충전, 멤버십 구매, 추가 가족 좌석, 전체·부분 환불을 검증한다.
- `test_ck_`, `test_sk_`, `TOSS_PAYMENT_MODE=test`만 허용한다.
- live key가 감지되면 서버와 UI 모두 실행을 거부한다.
- 실제 자동 정기결제와 earned point payout은 feature flag로 비활성화한다.

### 불변식

- callback의 amount를 신뢰하지 않고 저장된 order와 비교한다.
- Toss 승인 성공 전 posted transaction을 만들지 않는다.
- order ID, provider payment key, idempotency key 중복을 차단한다.
- 환불은 원 결제 취소 가능 잔액과 현재 topup 잔액을 모두 넘을 수 없다.
- 네트워크 재시도와 중복 callback에도 포인트가 한 번만 반영된다.
- secret key는 Supabase Secret에만 존재한다.

### 테스트

- provider fetch를 mock한 Edge Function unit test
- 성공·거절·timeout·중복 승인·부분 환불 pgTAP
- Web callback query validation과 사용자 오류 문구
- production bundle secret pattern scan

## 10. 단계 7 — 멤버십과 AI 코칭

### 기능

- 학생 집중 계획 검토
- 최근 공유 가능 집계 기반 학습 순서 추천
- 보호자용 동의 기반 가족 요약
- 주간 성취 요약

### 서버 실행 순서

```text
Auth
→ role
→ active membership
→ feature entitlement
→ rate limit
→ input schema
→ 최소 데이터 구성
→ provider 호출
→ output schema
→ 안전한 결과 반환
```

- AI가 계획 확정, 포인트 이동, 결제, 보상 승인을 수행하지 못한다.
- 보호자 요약에는 학생의 공유 설정을 적용한 aggregate만 사용한다.
- provider key와 raw error는 client에 노출하지 않는다.
- output은 구조화 schema로 검증하고 실패 시 저장하지 않는다.
- AI 오류는 기존 집중·기록·지갑 동작을 차단하지 않는다.
- 비회원 CTA는 membership 화면을 열며 client 표시만으로 entitlement를 확정하지 않는다.

## 11. 단계 8 — PWA·출시 준비

### PWA

- manifest, 192/512 아이콘, standalone 설정을 검증한다.
- service worker는 app shell과 명시적으로 안전한 정적 자산만 캐시한다.
- 인증 HTML, Supabase API, 결제 callback, wallet mutation, AI 응답은 캐시하지 않는다.
- 오프라인에서는 설명 화면과 이미 캐시된 비민감 shell만 제공한다.
- 금융·가족 연결·AI 버튼은 오프라인 상태에서 요청을 보내지 않고 이유와 다음 행동을 표시한다.
- 금융 mutation을 background sync queue에 넣지 않는다.
- Extension의 진행 중 집중은 Web offline과 무관하게 유지한다.

### 출시 점검

- production `externally_connectable`은 정확한 서비스 origin만 허용한다.
- localhost는 development manifest에서만 허용한다.
- 공개 환경변수와 server secret을 분리한다.
- source map과 번들에서 secret pattern을 검사한다.
- 접근성: dialog focus, keyboard navigation, chart table, aria label을 점검한다.
- mobile 1-column, desktop card grid를 브라우저에서 검증한다.
- 배포 전 체크리스트와 rollback 문서를 작성한다.

### 범위 밖

- 실제 Vercel 배포
- Chrome Web Store 제출
- Toss live mode 전환
- 자동 현금화
- 법률·회계 출시 승인

## 12. 오류 처리

사용자 오류 메시지는 다음 네 가지를 포함한다.

1. 실패한 작업
2. 현재 데이터가 안전한지
3. 재시도 가능 여부
4. 다음 행동

서버 stack trace, SQL detail, provider payload, secret 정보는 노출하지 않는다. 일시적 네트워크 오류는 retryable로 분류하되 금융·정산 요청은 동일 idempotency key를 재사용한다.

## 13. 테스트 전략

### 항상 실행

- contracts, Extension, Web Vitest
- Extension·Web typecheck
- ESLint
- Extension·Next.js production build
- migration diff와 DB lint
- Edge Function unit test
- 공개·인증 경계 Playwright

### 환경이 있을 때 실행

- 인증된 학생·보호자 Playwright
- 실제 Extension unpacked browser smoke
- Toss test payment browser smoke

### Supabase SQL Editor

- 신규 pgTAP은 단계별 파일로 실행한다.
- plan 수와 assertion 수를 일치시킨다.
- fixture는 고정 UUID와 고유 idempotency key를 사용한다.
- 모든 테스트는 rollback을 확인한다.

## 14. 커밋과 복구 단위

권장 커밋 순서:

```text
test: add authenticated focus flow coverage
feat: strengthen extension session recovery
feat: connect server notification center
feat: complete guardian reward settlement
fix: harden toss test payment flows
feat: complete membership coaching
chore: prepare pwa release checks
```

각 커밋은 이전 단계의 테스트를 모두 통과해야 한다. 원격 Supabase에 적용된 migration은 수정하지 않고 항상 새 forward migration으로 보정한다. 실제 배포 전에는 사용자가 최종 diff, 테스트 결과, migration 이력, Edge Function 배포 목록을 검토한다.

## 15. 최종 완료 조건

- 집중 생성부터 기록 조회까지 canonical 전체 흐름이 연결된다.
- Web 종료와 Extension 재시작 후에도 집중 상태가 복구된다.
- 학생·보호자 알림과 보상 원장이 중복 없이 동작한다.
- Toss 테스트 결제와 환불이 멱등하게 동작한다.
- 멤버십 사용자만 AI 기능을 사용한다.
- 보호자에게 비동의 원본 데이터가 전달되지 않는다.
- PWA offline 경계가 금융·AI 요청을 재전송하지 않는다.
- 전체 자동 테스트, DB lint, production build가 통과한다.
- 실제 배포만 별도 사용자 승인 단계로 남는다.
