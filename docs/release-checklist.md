# Mirujima v3 배포 전 체크리스트

기준일: 2026-10-02

대상 브랜치: `feat/complete-v3-release-flow`

배포 대상: Vercel Web/PWA, Chrome Extension Manifest V3, Supabase

이 문서는 배포 승인 전 검증표다. 2026-10-02 후속 요청으로 기존 Vercel 프로젝트에 Next.js preview를 배포했다. production 전환, Chrome Web Store 제출, Toss live 전환은 아직 하지 않았다. 최신 결과는 [출시 준비 후속 기록](superpowers/plans/2026-10-02-release-readiness-result.md)을 따른다.

## 1. 릴리스 범위 고정

- [ ] 릴리스 커밋 SHA와 변경 내역을 기록했다.
- [ ] `git status --short`가 비어 있다.
- [ ] 배포 대상이 테스트 모드 Toss임을 확인했다.
- [ ] 자동 현금화와 Toss 정기결제가 비활성 상태다.
- [ ] 운영 법률·회계·미성년자 정책은 별도 출시 게이트로 남겼다.

## 2. 환경변수와 Secret

### Web 공개 환경변수

브라우저 번들에 포함될 수 있으므로 비밀값을 넣지 않는다.

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_TOSS_PAYMENT_MODE    # 현재 test, live는 별도 승인 전환
NEXT_PUBLIC_TOSS_CLIENT_KEY       # 모드와 일치하는 *_ck_* 개별 연동 키
NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID
NEXT_PUBLIC_APP_ORIGIN
NEXT_PUBLIC_VAPID_PUBLIC_KEY     # Web Push 공개키
```

### Extension 공개 설정

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_WEB_APP_ORIGIN
```

### Supabase Edge Function Secret

아래 값은 Web/Extension 환경변수나 공개 테이블에 저장하지 않는다.

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_SECRET_KEY             # 신규 프로젝트의 server secret 명칭 사용 시
TOSS_PAYMENT_MODE=test
MIRUJIMA_LIVE_PAYMENTS_ENABLED=false # live 시 별도로 true, 현재 활성화 금지
MIRUJIMA_REFUND_MODE=sandbox    # provider_test는 0011 + 새 handler 동시 rollout·실계정 검증 후 별도 설정
TOSS_SECRET_KEY                 # test_sk_*만 사용
GROQ_API_KEY
GROQ_OCR_MODEL                  # 선택, 승인된 모델명
GROQ_WRITING_MODEL              # 선택, 승인된 모델명
MIRUJIMA_ALLOWED_ORIGINS
MIRUJIMA_SERVER_SIGNING_SECRET
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
MIRUJIMA_PUSH_DISPATCH_SECRET
```

- [ ] 공개 URL이 실제 Supabase 프로젝트와 일치한다.
- [ ] `NEXT_PUBLIC_APP_ORIGIN`과 Extension production origin이 `https://mirujima.vercel.app`로 일치한다.
- [ ] production manifest에는 exact origin만 있고 localhost가 없다.
- [ ] development manifest에만 localhost가 있다.
- [ ] `npm run security:scan-public`가 통과한다.
- [ ] 소스맵을 외부 공개할 경우에도 같은 비밀 패턴 검사를 수행한다.

## 3. Supabase

- [ ] `npx supabase migration list`에서 Local/Remote가 모두 일치한다.
- [ ] 저장소 마지막 migration은 `202610020016_operations_snapshot.sql`이다. 원격은 0001·0002·0004·0005·0008·0009·0013·0014·0015·0016까지 선택 반영했다. 0003·0006·0007·0010·0011·0012는 coordinated rollout 전까지 미적용이며 전체 Local/Remote 일치는 아직 아니다.
- [ ] `npx supabase db lint --linked --level error`가 오류 없이 끝난다.
- [ ] 모든 public table에 RLS가 활성화되어 있다.
- [ ] 금융 원장에는 authenticated client insert/update/delete 정책이 없다.
- [ ] pgTAP을 `BEGIN`/`ROLLBACK`으로 실행했고 fixture가 남지 않았다.

2026-08-24 적용 결과:

| 검증 | 결과 |
| --- | --- |
| 집중 수명주기 | 적용 및 회귀 통과 |
| 알림 이벤트 | 적용 및 회귀 통과 |
| 보호자 보상 원장 | 적용 및 회귀 통과 |
| Toss 신뢰성 pgTAP | 22/22 통과, rollback |
| AI 권한 경계 pgTAP | 10/10 통과, rollback |
| DB lint | error 0 |

2026-08-24 연결 프로젝트에서 확인한 ACTIVE Edge Function:

```text
ai-writing
cashout-request
cloud-sync
family-link-issue
family-link-redeem
get-membership-entitlements
membership-confirm-payment
membership-create-order
wallet-confirm-topup
wallet-create-topup-order
wallet-refund-topup
wallet-summary
```

저장소의 `membership-complete-test`, `wallet-complete-topup-test`는 로컬 테스트 보조 소스이며 현재 연결 프로젝트의 활성 Function 목록에는 없다. 실제 테스트 결제도 Toss 테스트 인증·승인 경로를 사용한다. `*-complete-test` Function을 live 환경에 배포하지 않는다.

## 4. 자동 검증

```bash
cd /Users/ldy/Desktop/Code/React/Mirujima
npm run verify:release
```

- [ ] Extension/contracts 전체 Vitest
- [ ] Web 전체 Vitest
- [ ] 공개/인증 Playwright
- [ ] Extension/Web typecheck
- [ ] ESLint
- [ ] Extension production build
- [ ] Next production build
- [ ] 공개 번들 Secret 검사

인증 Playwright는 아래 환경변수로 실제 테스트 계정 상태를 주입한다.

```text
MIRUJIMA_E2E_STORAGE_STATE=/absolute/path/to/storage-state.json
MIRUJIMA_E2E_ROLE=student|guardian
```

인증 상태 파일은 저장소에 커밋하지 않는다.

## 5. 수동 smoke test

### 학생

- [ ] Google 로그인 → 역할/온보딩 → `/home` 이동
- [ ] 집중 계획 저장 → 서버 세션 시작 → Extension 차단/타이머 동작
- [ ] Web를 닫았다 다시 열어도 Extension에서 세션 복구
- [ ] 완료 후 `/history`에 목표, 집중 시간, 성공 결과가 표시됨
- [ ] 기록의 일/주/월 필터, 차트, 표 요약이 같은 값을 표시함
- [ ] self deposit 성공/실패가 불변 원장 규칙대로 정산됨
- [ ] AI 추천은 명시적 적용 전 계획을 바꾸지 않음

### 보호자

- [ ] 6자리 연결 코드 발급/사용/만료/재발급
- [ ] 보상 요청 승인/거절과 학생 성공/실패 정산
- [ ] 학생이 공유한 집계 정보만 표시됨
- [ ] AI 가족 요약은 AI 공유 동의가 켜진 학생만 포함함

### Toss 테스트 결제

- [ ] 서버가 만든 orderId/금액으로 테스트 결제 승인
- [ ] callback 금액 위변조 시 승인 거절 및 잔액 불변
- [ ] 같은 paymentKey/orderId 재호출 시 중복 적립 없음
- [ ] 부분 환불은 원 결제 잔여 취소 가능액과 topup 가용액을 넘지 않음
- [ ] 승인/취소 provider 실패 시 posted 원장이 생성되지 않음
- [ ] 멤버십 결제 후 entitlement가 서버에서 활성화됨

### PWA·접근성

- [ ] 설치 prompt와 standalone 실행 확인
- [ ] 공개 홈/사용법/개인정보/오프라인 화면만 오프라인에서 표시
- [ ] 로그인·가족·집중 상태 변경·지갑·결제·AI는 오프라인에서 요청하지 않음
- [ ] 오프라인 중 진행 중인 Extension 집중/차단은 유지
- [ ] 결제 dialog의 초기 focus, Tab 순환, Escape 닫기
- [ ] 모바일 390px에서 가로 overflow 없음
- [ ] desktop에서 핵심 카드 grid와 navigation 확인

## 6. 배포 승인 순서

1. 데이터베이스 migration 적용과 DB lint
2. Edge Function 및 Secret 적용
3. Web/PWA preview smoke test 후 production 승격
4. Extension production 빌드 smoke test 후 Web Store 제출
5. 인증/집중/기록/금융/AI 관측과 알림 확인

문제가 발견되면 새 금융 요청을 먼저 차단하고 [rollback.md](./rollback.md)의 순서를 따른다.

## 2026-10-02 개발 검증 추가 기록

[1차 구현·검증 결과](superpowers/plans/2026-10-02-project-completion-progress.md)는 이전 운영 검증과 분리한다. 릴리스 E2E는 `npm run test:e2e:release:web`로 실행하며 인증 상태 누락을 실패로 처리한다. 공개 E2E 통과와 인증 3개 skip은 릴리스 통과가 아니다. 1차 시점에는 신규 SQL 3개를 로컬에서만 적용했다. 2차에서는 0001·0002를 원격 적용하고 migration 대조·DB lint·익명 RPC 거부를 확인했다. 3차에서 0004 계획 수정·취소 경계도 원격 적용했다. 0003은 미적용이다.

2차의 Web E2E 22개·인증 3개 skip과 실제 Chromium Extension smoke 8개를 구분한다. [2차 검증 기록](superpowers/plans/2026-10-02-project-completion-phase-2.md), [개발 연결 안내](development-web-extension.md)를 따른다.

4차에서 0005 휴식 RPC를 원격 적용했다. [4차 검증 기록](superpowers/plans/2026-10-02-project-completion-phase-4.md)의 SQL 402개·MV3 smoke 9개·로컬 React UI 검증은 실계정 Auth/정산 통합 검증과 구분한다. 신규 전액 정산 정책 0006과 시작 확인 0003은 원격 미적용이며 순서대로 함께 배포해야 한다.

- [ ] 5차 0007 시작 전 보호자 승인: 0003 → 0006 → 0007과 새 Web/Extension 동시 rollout. 학생/보호자 실계정으로 승인 전 시작 차단·승인 후 시작·요청 취소·차단 적용 실패 시 양쪽 반환을 확인한다. [로컬 검증 기록](superpowers/plans/2026-10-02-project-completion-phase-5.md)은 원격 실통합을 대체하지 않는다.

- [x] 6차 연결 코드 0008 Supabase 적용: 단일 migration dry-run 확인, remote 반영, DB lint 오류 없음, issue/redeem/cancel 익명 RPC HTTP 401/42501. [검증 기록](superpowers/plans/2026-10-02-project-completion-phase-6.md).
- [ ] 신규 가족 연결 UI Web 배포와 학생/보호자 실계정 Edge Function 여정 확인. 0003·0006·0007 금융 정책은 계속 보류한다. 로컬 root에서 전체 `db push`를 바로 실행하지 말고 대상별 dry-run을 먼저 확인한다.

## 지갑 조회·거래 표시 (7차)

2026-10-02 `wallet-summary` 단일 Edge Function을 원격 배포했다. 환불 한도 조회 오류를 0P로 반환하지 않으며 익명 POST HTTP 401을 확인했다. Web의 오류/미확정 거래 UI는 로컬 구현·검증이며 Web 배포와 실제 인증 계정의 ledger 대조는 남아 있다. 0003·0006·0007 migration은 이번 배포에 포함하지 않았다. [7차 검증 기록](superpowers/plans/2026-10-02-project-completion-phase-7.md).

## 결제 승인 복구 (9차)

- [ ] 0010·공유 payment recovery helper·충전/멤버십 승인 handler·Web을 함께 검증하고 배포한다. 주문 canonical status와 조회 전용 복구 플래그 때문에 개별 rollout하지 않는다. 현재 로컬 검증이며 원격 미적용이다.
- [ ] 실제 테스트 계정으로 Toss 승인 후 DB 실패·중복 callback·조회 복구와 원장 단일 반영을 대조한다. 실제 provider 부분 취소·환불 응답 유실 복구는 아직 개발 대상이다. [9차 기록](superpowers/plans/2026-10-02-project-completion-phase-9.md).

## 부분 취소·환불 복구 (10차)

- [ ] 0011·신규 환불 handler·공유 helper·Web을 함께 rollout한다. `MIRUJIMA_REFUND_MODE`를 명시하고 구버전 handler의 unknown 자동 반환과 혼합하지 않는다. 현재 로컬 구현이며 원격 미적용이다.
- [ ] 실제 계정 카드 테스트 부분 취소·중복·DB 실패·응답 유실을 provider 거래와 원장으로 대조한다. SQL 31개와 독립 연결 경합 4개 통과는 실제 Toss 여정을 대체하지 않는다.
- [ ] dispatch 기록 직후 프로세스 종료·추가 외부 취소·카드 외 수단의 운영 대조/복구 절차와 도구를 준비한다. 같은 요청의 완료 조회가 없으면 예약을 유지하며 새 취소를 발행하지 않는다. [10차 기록](superpowers/plans/2026-10-02-project-completion-phase-10.md).

## 멤버십 주문·기간·권한 (11차)

- [ ] 0012·멤버십 승인 handler·Web·Extension을 함께 검증하고 rollout한다. Web은 본인 주문의 canonical status와 paymentOrder 영수증을 검증한다. 현재 로컬이며 원격 미적용이다.
- [ ] 실제 학생/보호자 계정에서 주문 복구·좌석 주문·만료·비활성·가족 entitlement disabled/expired·연결 해제 후 AI 서버 차단을 확인한다. SQL 31개·경합 3개와 MV3 smoke 9개는 실제 유료 계정의 통합 검증을 대체하지 않는다.
- [ ] 이미 승인된 이용권의 provider 환불/취소 후 권한 철회, stale/legacy 주문의 운영 복구 절차를 준비한다. 결제창 pending 주문 취소와 구분한다. [11차 기록](superpowers/plans/2026-10-02-project-completion-phase-11.md).

## 전체 원장 조회 (8차)

`/wallet/history`에서 충전·집중·보상·지급 거래를 본인 범위로 조회한다. 2026-10-02 Supabase에 조회 전용 0009를 단독 적용하고 DB lint 오류 없음을 확인했다. 실제 계정의 원격 조회·ledger 대조와 Web 배포는 남아 있다. 0003·0006·0007 집중 정산 변경은 포함하지 않았다. [8차 검증 기록](superpowers/plans/2026-10-02-project-completion-phase-8.md).

## W11–W15 연속 개발

[구현·검증 결과](superpowers/plans/2026-10-02-project-completion-w11-w15.md)와 [운영 절차](operations.md)를 따른다. 공개 UI·기록 원장 집계·AI 동의·PWA/푸시·CI/운영 경계를 구현했다.

- [x] 0013–0016 네 SQL만 dry-run 대조 후 연결 Supabase 적용. 원격 migration 대조 및 DB lint 오류 없음.
- [x] ai-writing v16·notification-push-dispatch v2 ACTIVE, JWT 검증 ON, 익명 POST 각각 HTTP 401.
- [x] 로컬 Vitest 453·PostgreSQL/pgTAP 645·공개 E2E 51·실제 MV3 smoke 9, 실제 Dialog focus 및 production SW 설치/오프라인/업데이트 검사 통과.
- [x] 공개 harness 54 화면·300 검사·324 rubric 행 확인. 인증 후 화면 전수 검증과 별도다.
- [ ] 실제 계정·provider·지원 기기의 통합 검증과 Vercel staging 배포.
- [ ] VAPID/dispatch secret·서버 scheduler 구성 및 실제 알림 전달.
- [ ] GitHub workflow 실행·구버전 Extension 호환·DB 복원 연습·보존 정책 확정.

출시 검증은 `verify:local` + DB + 실제 browser 검사 + 필수 인증 E2E + release evidence다. `verify:release:evidence`는 현재 HEAD와 일치하는 SHA, 생성 7일 이내 증거, 7개 실제 gate를 요구하며 미커밋 제품 변경이 있으면 실패한다. Next 자동 생성 type 파일만 변경 판단에서 제외한다. 실제 계정이 없는 현재 `verify:release`는 전체 통과 상태가 아니다.

## 결제 출시 직전 보완

제품 화면의 테스트 문구 제거와 현금화 차단, 명시적인 운영 모드 전환 경로를 추가했다. API 테스트 모드와 원격 production은 그대로 유지한다. 새 `0017`은 `0011` 이후에 적용하며, provider_test/provider_live 예약은 서로 전환하거나 다른 모드 영수증으로 완료할 수 없다. [결제 준비 결과](superpowers/plans/2026-10-02-payment-launch-result.md)와 [전환 절차](payment-launch-runbook.md)를 따른다.

## 2026-10-03 기존 원격 반영

유료 검증 환경은 생성하지 않았다. 보류 migration 9개와 대응 Edge Function 13개를 기존 Supabase에 적용하고 원격 DB lint 및 테스트 계정 여정을 검증했다. Toss test 모드와 live 비활성화를 유지했다. 과거 보류 상태는 당시 기록이며 [최신 반영 결과](superpowers/plans/2026-10-03-remote-rollout-result.md)를 따른다. 실제 Toss·Google OAuth·기기 Push·복원 게이트는 아직 미완료다.
