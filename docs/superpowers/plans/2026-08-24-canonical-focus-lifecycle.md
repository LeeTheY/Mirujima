# Canonical Focus Lifecycle Implementation Plan

**Goal:** Web과 Chrome Extension이 Supabase canonical 세션의 pause, resume, awaiting-result, terminal 상태와 목표별 정산 결과에 수렴하도록 구현한다.

**Architecture:** 공유 Zod 계약을 먼저 확장하고, 기존 JSONB session row에 lifecycle RPC를 additive하게 추가한다. Web은 service 계층으로 mount 복구와 상태 전이를 수행하며, Extension은 상태별 reconciliation과 local pending settlement queue를 사용한다. 신규 DB table은 만들지 않는다.

**Tech Stack:** TypeScript, React, Next.js, Vite, Chrome MV3, Supabase PostgreSQL/RPC, Zod, Vitest, pgTAP

## Task 1: 공유 계약

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/focus.test.ts`

- [x] settlement result와 lifecycle field schema를 추가한다.
- [x] 이전 canonical payload의 호환 기본값을 검증한다.
- [x] 완료율 helper와 reconcile external message를 테스트한다.

## Task 2: Supabase lifecycle RPC

**Files:**
- Create: `supabase/migrations/202608240001_canonical_focus_lifecycle.sql`
- Create: `supabase/tests/database/canonical_focus_lifecycle.test.sql`

- [x] `get_current_focus_session`, `get_focus_session`을 추가한다.
- [x] pause/resume의 누적 시간과 남은 시간 계산을 transaction/lock 안에서 구현한다.
- [x] 기존 finish가 lifecycle field를 terminal 상태로 고정하도록 교체한다.
- [x] 소유권, 만료 정규화, 멱등성, 원장 중복 방지를 pgTAP으로 고정한다.

## Task 3: Web 복구와 상태 전이

**Files:**
- Create: `apps/web/features/focus/canonical-focus-service.ts`
- Create: `apps/web/features/focus/canonical-focus-service.test.ts`
- Modify: `apps/web/features/focus/focus-planner.tsx`
- Modify: `apps/web/features/extension/bridge.ts`
- Modify: `apps/web/features/extension/bridge.test.ts`

- [x] mount에서 current session을 복구한다.
- [x] active/paused/awaiting-result UI와 서버 pause/resume을 연결한다.
- [x] 진행 세션 중 새 submit을 차단한다.
- [x] 완료 후 Extension reconcile 요청을 best-effort로 보낸다.

## Task 4: Extension storage와 canonical service

**Files:**
- Modify: `src/shared/types/models.ts`
- Modify: `src/shared/constants/index.ts`
- Modify: `src/shared/storage/migrations.ts`
- Modify: `src/shared/storage/migrations.test.ts`
- Modify: `src/shared/storage/repository.ts`
- Modify: `src/features/web-bridge/canonical-focus.ts`
- Modify: `src/features/web-bridge/canonical-focus.test.ts`

- [x] local session에 goals/result/lifecycle field를 보존한다.
- [x] pending canonical settlement storage를 추가한다.
- [x] active/paused/awaiting/terminal reconciliation을 구현한다.
- [x] terminal local history 반영을 중복 없이 처리한다.

## Task 5: Extension action과 목표 UI

**Files:**
- Modify: `src/shared/types/messages.ts`
- Modify: `src/background/message-handler.ts`
- Modify: `src/background/service-worker.ts`
- Modify: `src/background/bootstrap.ts`
- Modify: `src/features/web-bridge/external-handler.ts`
- Modify: `src/features/focus/FocusPage.tsx`
- Modify: `src/popup/PopupApp.tsx`

- [x] canonical pause/resume/finish를 서버 service로 분기한다.
- [x] 목표별 체크리스트와 확정 결과를 Extension UI에 표시한다.
- [x] alarm/bootstrap/auth restore에서 pending settlement를 재시도한다.
- [x] 기존 local-only session 흐름을 유지한다.

## Task 6: 품질 검증

- [x] 관련 Vitest를 먼저 통과시킨다.
- [x] 전체 typecheck/test/lint/build를 실행한다.
- [x] 기존 root lint 미사용 import 9개를 기능 변경 없이 정리한다.
- [x] SQL은 정적 검토하고, 로컬 Supabase가 없으면 pgTAP 미실행 사실을 기록한다.
- [x] diff에서 무관한 파일과 생성 산출물을 제외한다.
