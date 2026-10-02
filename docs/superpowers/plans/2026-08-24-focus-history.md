# Focus History Implementation Plan

**Goal:** 완료된 canonical 집중 세션을 학생 기록 화면에 실제 표시하고, 보호자에게는 공유 동의된 집계만 제공한다.

**Architecture:** 기존 `cloud_focus_sessions.payload`를 기준 데이터로 유지한다. Extension metric은 소유자 전용 RPC로 monotonic하게 병합하고, 학생·보호자 기록은 서로 다른 security definer RPC가 반환한다. Web은 공유 Zod 계약으로 응답을 검증한 뒤 server page와 client dashboard를 분리해 렌더링한다.

**Tech Stack:** PostgreSQL/Supabase RPC, pgTAP, TypeScript, Zod, React/Next.js, Chrome MV3, Vitest

## Task 1: 공유 기록 계약과 query 규칙

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/history.test.ts`
- Create: `apps/web/features/history/history-query.ts`
- Create: `apps/web/features/history/history-query.test.ts`

- [x] 학생·보호자 기록 응답 schema와 타입을 추가한다.
- [x] period/date/student query를 안전한 기본값으로 정규화한다.
- [x] 잘못된 서버 payload와 query를 테스트한다.

## Task 2: Supabase metric 및 기록 RPC

**Files:**
- Create: `supabase/migrations/202608240002_focus_history.sql`
- Create: `supabase/tests/database/focus_history.test.sql`

- [x] `sync_focus_session_metrics()`를 소유자·integer·상한 검증과 `greatest()` 병합으로 구현한다.
- [x] `get_student_focus_history()`에 terminal filtering, 기간, trend, summary, session detail을 구현한다.
- [x] `get_guardian_focus_history()`에 active family link와 sharing preference filtering을 구현한다.
- [x] 기존 table partial index와 function 권한을 추가한다.
- [x] 본인/타인/보호자/privacy/기간 경계를 pgTAP으로 고정한다.

## Task 3: Web 기록 데이터 계층

**Files:**
- Create: `apps/web/features/history/history-data.ts`
- Create: `apps/web/features/history/history-data.test.ts`
- Create: `apps/web/features/history/history-format.ts`
- Create: `apps/web/features/history/history-format.test.ts`

- [x] server Supabase client로 RPC를 호출한다.
- [x] 공유 계약 parse와 safe error state를 구현한다.
- [x] 날짜 이동, 기간 label, 시간 formatting을 순수 함수로 구현한다.

## Task 4: 학생 기록 화면

**Files:**
- Modify: `apps/web/app/history/page.tsx`
- Create: `apps/web/features/history/student-history-dashboard.tsx`
- Modify: `apps/web/app/globals.css`

- [x] 정적 0 값을 실제 summary로 교체한다.
- [x] 일·주·월과 이전/다음 기간 링크를 연결한다.
- [x] 날짜별 추이, 접근 가능한 표, 목표별 세션 상세를 표시한다.
- [x] empty/error/truncated 상태를 분리한다.

## Task 5: 보호자 기록 화면

**Files:**
- Modify: `apps/web/app/guardian/history/page.tsx`
- Create: `apps/web/features/history/guardian-history-dashboard.tsx`
- Modify: `apps/web/app/globals.css`

- [x] 연결 학생 selector와 기본 학생 선택을 구현한다.
- [x] 공유 허용 summary/trend만 표시한다.
- [x] 비공개 값은 0이 아닌 “공유 안 함”으로 표시한다.
- [x] 학생 없음/data 없음/error 상태를 분리한다.

## Task 6: Extension metric 동기화

**Files:**
- Modify: `src/features/web-bridge/canonical-focus.ts`
- Modify: `src/features/web-bridge/canonical-focus.test.ts`

- [x] canonical local metric payload builder를 추가한다.
- [x] reconcile/pause/finish 전에 best-effort 동기화한다.
- [x] metric 실패가 상태 전환·정산을 막지 않도록 테스트한다.

## Task 7: 품질 검증과 커밋

- [x] contracts/root/web Vitest를 통과시킨다.
- [x] root/web typecheck와 ESLint를 통과시킨다.
- [x] Extension과 Next.js production build를 통과시킨다.
- [x] SQL을 기존 migration signature와 정적으로 대조한다.
- [x] 로컬 PostgreSQL이 없으면 pgTAP 미실행을 기록한다.
- [x] 생성 산출물과 무관 변경을 제외하고 논리별 커밋을 만든다.
