# Mirujima v3 배포 전 체크리스트

기준일: 2026-08-24

대상 브랜치: `feat/complete-v3-release-flow`

배포 대상: Vercel Web/PWA, Chrome Extension Manifest V3, Supabase

이 문서는 배포를 실행하는 명령서가 아니라 배포 승인 전 검증표다. 현재 작업에서는 실제 Vercel 배포, Chrome Web Store 제출, Toss live 전환을 하지 않는다.

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
NEXT_PUBLIC_TOSS_CLIENT_KEY       # 테스트에서는 test_ck_*만 허용
NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID
NEXT_PUBLIC_APP_ORIGIN
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
TOSS_SECRET_KEY                 # test_sk_*만 사용
GROQ_API_KEY
GROQ_OCR_MODEL                  # 선택, 승인된 모델명
GROQ_WRITING_MODEL              # 선택, 승인된 모델명
MIRUJIMA_ALLOWED_ORIGINS
MIRUJIMA_SERVER_SIGNING_SECRET
```

- [ ] 공개 URL이 실제 Supabase 프로젝트와 일치한다.
- [ ] `NEXT_PUBLIC_APP_ORIGIN`과 Extension production origin이 `https://mirujima.vercel.app`로 일치한다.
- [ ] production manifest에는 exact origin만 있고 localhost가 없다.
- [ ] development manifest에만 localhost가 있다.
- [ ] `npm run security:scan-public`가 통과한다.
- [ ] 소스맵을 외부 공개할 경우에도 같은 비밀 패턴 검사를 수행한다.

## 3. Supabase

- [ ] `npx supabase migration list`에서 Local/Remote가 모두 일치한다.
- [ ] 마지막 migration이 `202608240010_ai_coaching_boundaries.sql`이다.
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
MIRUJIMA_E2E_AUTH_STATE=/absolute/path/to/storage-state.json
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
