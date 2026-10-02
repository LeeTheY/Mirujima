# Mirujima v3 단계 2~8 구현 계획

설계 기준: `docs/superpowers/specs/2026-08-24-v3-release-flow-design.md`

## 실행 규칙

- 아래 순서를 변경하지 않는다.
- 단계별 관련 테스트가 통과하기 전 다음 단계로 진행하지 않는다.
- 원격에 적용된 migration은 수정하지 않고 새 forward migration으로 보정한다.
- Supabase 변경은 `dry-run → push → lint` 순서로 적용한다.
- Edge Function은 unit test 후 연결된 개발 프로젝트에 배포한다.
- 실제 운영 결제와 실제 배포는 수행하지 않는다.
- 인증 정보, storage state, service role, Toss secret, AI provider key를 Git에 포함하지 않는다.

## Task 2.1 — Playwright 기반 추가

**Files**

- Modify: `apps/web/package.json`
- Modify: `package-lock.json`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/public-routes.spec.ts`
- Create: `apps/web/e2e/auth-boundaries.spec.ts`
- Create: `apps/web/e2e/helpers/auth-state.ts`
- Modify: `.gitignore`

**Implementation**

- [ ] `@playwright/test`와 `test:e2e` script를 추가한다.
- [ ] Next dev server를 자동 시작하는 Playwright config를 추가한다.
- [ ] trace/screenshot/video는 실패 시에만 남긴다.
- [ ] `.auth`, `test-results`, `playwright-report`를 Git에서 제외한다.
- [ ] 공개 route와 미인증 redirect를 실제 브라우저로 검증한다.
- [ ] 선택적 storage state가 없으면 인증 suite를 명시적으로 skip한다.

**Verification**

- [ ] Web Vitest/typecheck/lint
- [ ] `npm --workspace apps/web run test:e2e`
- [ ] Next production build

**Commit**

```text
test: add authenticated focus flow coverage
```

## Task 3.1 — Extension 메시지 중복·순서 경계

**Files**

- Modify: `packages/contracts/src/index.ts`
- Modify: `src/features/web-bridge/external-handler.ts`
- Modify: `src/features/web-bridge/external-handler.test.ts`
- Modify: `src/shared/constants/index.ts`
- Modify: `src/shared/storage/repository.ts`
- Modify: `src/shared/types/models.ts`

**Implementation**

- [ ] 처리한 external `requestId`를 bounded TTL cache로 저장한다.
- [ ] 동일 요청 재수신 시 canonical state를 중복 적용하지 않고 현재 상태를 반환한다.
- [ ] session 소유권과 expected origin 검증을 유지한다.
- [ ] 오래된 canonical `updatedAt`이 최신 local canonical state를 덮지 못하게 한다.
- [ ] 사용자 변경 시 이전 사용자의 runtime state를 제거한다.

## Task 3.2 — 재시작·정산 복구 강화

**Files**

- Modify: `src/features/web-bridge/canonical-focus.ts`
- Modify: `src/features/web-bridge/canonical-focus.test.ts`
- Modify: `src/background/bootstrap.ts`
- Modify: `src/background/background.test.ts`
- Modify: `src/background/service-worker.ts`

**Implementation**

- [ ] pending settlement를 current session reconcile보다 먼저 재시도한다.
- [ ] terminal 상태에서 DNR, alarm, badge, temporary allow를 정리한다.
- [ ] resync 실패가 local active session을 실패 처리하지 않게 한다.
- [ ] 로그아웃/사용자 변경 경계를 회귀 테스트한다.
- [ ] Web 화면에는 canonical row Realtime invalidation을 추가하되 RPC 재조회를 수행한다.

**Verification**

- [ ] contracts/root/web tests
- [ ] Extension typecheck/lint/build
- [ ] restart/message duplication unit tests

**Commit**

```text
feat: strengthen extension session recovery
```

## Task 4.1 — notifications schema와 RPC

**Files**

- Create: `supabase/migrations/<timestamp>_notifications.sql`
- Create: `supabase/tests/database/notifications.test.sql`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/notifications.test.ts`

**Implementation**

- [ ] `notifications` table, index, constraints, RLS를 추가한다.
- [ ] 일반 client insert/update/delete 권한을 제거한다.
- [ ] `create_notification` internal helper와 dedupe 규칙을 추가한다.
- [ ] 목록, unread count, 단건 읽음, 전체 읽음 RPC를 추가한다.
- [ ] payload 허용 key·길이·종류를 서버에서 검증한다.
- [ ] 타 사용자 조회·읽음·삭제 차단을 pgTAP으로 고정한다.

## Task 4.2 — 알림 이벤트 연결

**Files**

- Create: `supabase/migrations/<timestamp>_notification_events.sql`
- Modify: focus/family/wallet/membership RPC via forward migration
- Modify: related pgTAP files or create `notification_events.test.sql`

**Implementation**

- [ ] family link, focus result, guardian reward, topup/refund, membership 이벤트를 생성한다.
- [ ] event별 deterministic `dedupe_key`를 사용한다.
- [ ] 보호자 알림에 raw hostname/activity를 포함하지 않는다.
- [ ] transaction rollback 시 알림도 남지 않게 한다.

## Task 4.3 — Web·Extension 알림 UI

**Files**

- Modify: `apps/web/components/notification-center.tsx`
- Modify: `apps/web/components/dashboard-shell.tsx`
- Create: `apps/web/features/notifications/notification-data.ts`
- Create: `apps/web/features/notifications/notification-data.test.ts`
- Create: `apps/web/features/notifications/notification-format.ts`
- Create: `apps/web/features/notifications/notification-format.test.ts`
- Modify: `src/background/notifications.ts`
- Modify: `src/background/service-worker.ts`

**Implementation**

- [ ] 서버 목록·unread count를 실제 Bell UI에 연결한다.
- [ ] cursor pagination과 safe error state를 추가한다.
- [ ] 삭제 버튼을 제거하고 읽음 처리만 제공한다.
- [ ] Extension은 canonical event resync 시 필요한 system notification만 표시한다.

**Deployment and verification**

- [ ] contracts/root/web tests
- [ ] notifications pgTAP via SQL Editor
- [ ] migration dry-run/push/lint
- [ ] production builds

**Commit**

```text
feat: connect server notification center
```

## Task 5.1 — 보호자 보상 상태 계약과 RPC

**Files**

- Create: `supabase/migrations/<timestamp>_guardian_reward_workflow.sql`
- Create: `supabase/tests/database/guardian_reward_workflow.test.sql`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/guardian-rewards.test.ts`

**Implementation**

- [ ] 요청 조회와 상태 응답 계약을 추가한다.
- [ ] 학생 요청 생성, 보호자 승인·거절 RPC를 정리한다.
- [ ] request advisory lock 후 guardian ledger row lock 순서를 고정한다.
- [ ] topup→reserved, success→earned, failure/cancel→topup을 멱등 처리한다.
- [ ] active link, role, balance, terminal 상태를 transaction 안에서 검증한다.
- [ ] 연결 해제 전 pending/reserved 항목을 검사한다.

## Task 5.2 — 보호자 보상 Web 연결

**Files**

- Modify: `apps/web/features/family/guardian-reward-requests.tsx`
- Modify: `apps/web/features/family/guardian-reward-requests-modal.tsx`
- Create: `apps/web/features/family/guardian-reward-data.ts`
- Create: `apps/web/features/family/guardian-reward-data.test.ts`
- Modify: `apps/web/features/focus/focus-planner.tsx`
- Modify: wallet/history components as required

**Implementation**

- [ ] 정적 empty card를 실제 요청 목록으로 교체한다.
- [ ] 승인·거절 pending UI와 중복 submit 방지를 추가한다.
- [ ] 잔액 부족, 이미 처리됨, 연결 변경 오류를 안전한 문구로 표시한다.
- [ ] 학생 계획 화면과 기록·지갑을 서버 상태로 갱신한다.

**Deployment and verification**

- [ ] guardian reward pgTAP via SQL Editor
- [ ] migration dry-run/push/lint
- [ ] Web tests/typecheck/build

**Commit**

```text
feat: complete guardian reward settlement
```

## Task 6.1 — Toss 테스트 경계 감사와 보강

**Files**

- Modify: `supabase/functions/_shared/toss.ts`
- Modify: `supabase/functions/_shared/toss.test.ts`
- Modify: wallet/membership/refund Edge Functions as required
- Create or modify: forward migration for payment invariants
- Create: `supabase/tests/database/toss_reliability.test.sql`

**Implementation**

- [ ] live client/secret/mode를 모두 거부한다.
- [ ] stored order amount와 callback/provider amount를 교차 검증한다.
- [ ] order/payment/idempotency 중복을 차단한다.
- [ ] 부분 환불 한도와 동시 환불 lock을 검증한다.
- [ ] provider timeout·5xx retryability와 사용자 오류를 분리한다.
- [ ] production bundle secret pattern 검사 script를 추가한다.

## Task 6.2 — Toss Web callback·오류 상태

**Files**

- Modify: `apps/web/features/membership/payment.ts`
- Modify: `apps/web/features/membership/payment.test.ts`
- Modify: `apps/web/features/wallet/topup-panel.tsx`
- Modify: `apps/web/features/wallet/refund-panel.tsx`
- Modify: membership success/fail and wallet success/fail routes

**Implementation**

- [ ] query parsing과 stored order mismatch 상태를 분리한다.
- [ ] 중복 callback은 성공 결과를 재사용한다.
- [ ] 승인 실패 시 잔액 미반영을 명확히 표시한다.
- [ ] test mode label과 실제 청구 없음 안내를 유지한다.

**Deployment and verification**

- [ ] Edge Function tests
- [ ] Toss reliability pgTAP
- [ ] migration push/lint if present
- [ ] changed Edge Function deploy
- [ ] Web tests/build and secret scan

**Commit**

```text
fix: harden toss test payment flows
```

## Task 7.1 — AI 요청·응답 계약

**Files**

- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/ai-coaching.test.ts`
- Modify: `supabase/functions/ai-writing/index.ts`
- Create or modify: shared AI validation modules/tests
- Create: forward migration for AI task/rate-limit additions if required
- Create: `supabase/tests/database/ai_coaching.test.sql`

**Implementation**

- [ ] focus-plan-review, study-recommendation, guardian-summary, weekly-report schema를 추가한다.
- [ ] auth→role→membership→entitlement→rate limit 순서를 고정한다.
- [ ] provider 입력을 최소 데이터로 구성한다.
- [ ] structured output을 검증하고 invalid output을 거부한다.
- [ ] guardian summary는 공유 동의 aggregate만 사용한다.

## Task 7.2 — 학생·보호자 AI UI 완성

**Files**

- Modify: `apps/web/features/focus/focus-planner.tsx`
- Modify: `apps/web/features/membership/guardian-ai-summary.tsx`
- Create: student recommendation/weekly summary components as required
- Create: related Vitest files

**Implementation**

- [ ] 비회원은 membership CTA를 표시한다.
- [ ] AI 결과를 사용자 확인 전 계획에 적용하지 않는다.
- [ ] timeout/provider 오류가 기존 작성 내용을 지우지 않게 한다.
- [ ] loading, retry, invalid output 상태를 분리한다.

**Deployment and verification**

- [ ] AI Edge unit tests
- [ ] entitlement/rate limit pgTAP
- [ ] migration push/lint if present
- [ ] `ai-writing` deploy
- [ ] Web tests/build

**Commit**

```text
feat: complete membership coaching
```

## Task 8.1 — PWA offline 경계

**Files**

- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/components/pwa-register.tsx`
- Modify: `apps/web/lib/pwa.ts`
- Modify: `apps/web/lib/pwa.test.ts`
- Create: `apps/web/app/offline/page.tsx`
- Modify: Web mutation components to use shared online guard
- Create: shared online guard and tests

**Implementation**

- [ ] app shell·정적 자산 allowlist만 cache한다.
- [ ] auth, Supabase API, payment callback, wallet, AI response를 cache하지 않는다.
- [ ] offline fallback 화면을 추가한다.
- [ ] 금융·가족·AI mutation을 offline에서 시작하지 않는다.
- [ ] background sync에 금융 요청을 등록하지 않는다.

## Task 8.2 — 보안·접근성·출시 검사

**Files**

- Modify: `public/manifest.json` and dev manifest handling as required
- Create: `scripts/check-public-secrets.mjs`
- Create: `docs/release-checklist.md`
- Create: `docs/rollback.md`
- Modify: package scripts
- Modify: Playwright accessibility/responsive specs

**Implementation**

- [ ] production exact origin과 development localhost를 분리한다.
- [ ] public/server env inventory를 문서화한다.
- [ ] secret pattern scan을 build gate에 추가한다.
- [ ] dialog keyboard/focus, chart table, aria label을 검증한다.
- [ ] mobile·desktop 핵심 route를 브라우저로 점검한다.
- [ ] migration·Edge Function·Web·Extension rollback 순서를 문서화한다.

## Task 8.3 — 전체 회귀와 최종 상태

- [ ] contracts tests
- [ ] Extension 전체 Vitest
- [ ] Web 전체 Vitest
- [ ] public/auth Playwright
- [ ] Extension/Web typecheck
- [ ] ESLint
- [ ] Extension production build
- [ ] Next production build
- [ ] Supabase migration list 일치
- [ ] Supabase DB lint 오류 없음
- [ ] 신규 pgTAP SQL Editor 결과 기록
- [ ] 배포된 Edge Function 목록 확인
- [ ] Git diff/check/status 확인

**Commit**

```text
chore: prepare pwa release checks
```

## 최종 인계

- 실제 배포하지 않는다.
- 사용자가 인증 계정 smoke test와 Toss 테스트 결제 화면을 최종 확인할 수 있는 체크리스트를 제공한다.
- 브랜치, 커밋, Supabase migration, Edge Function, 테스트 결과와 남은 수동 검증을 보고한다.
