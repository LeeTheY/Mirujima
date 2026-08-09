# Extension Web Responsibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chrome Extension을 브라우저 집중 실행 에이전트로 축소하고 웹과 중복되는 사용자 화면을 제거한다.

**Architecture:** background와 공유 message/model 계층은 유지하고 React surface만 먼저 축소한다. Popup은 현재 세션 제어와 Chrome 전용 탭 정리를 유지하며, Side Panel/App은 웹 앱 링크와 active session 상태 중심의 얇은 shell을 사용한다.

**Tech Stack:** React, TypeScript, Vite, Chrome Manifest V3, Vitest

## Global Constraints

- DNR, alarms, service worker, active session recovery, external messaging을 제거하지 않는다.
- Chrome API가 필요한 탭 정리는 Extension에 유지한다.
- 웹에서 실제 접근 가능한 기능만 Extension 화면에서 제거한다.
- 기존 storage schema와 공유 model은 이번 UI 축소에서 삭제하지 않는다.
- UI 삭제와 background/data migration을 한 변경으로 묶지 않는다.

---

### Task 1: 기능 책임 인벤토리 고정

**Files:**
- Create: `docs/extension-web-capability-matrix.md`
- Test: none (human architecture document)

- [ ] **Step 1: 각 Extension 화면과 background 의존성을 `extension-only`, `web-primary`, `shared-contract`로 기록한다**

표에는 source file, Chrome API 의존성, Web 대체 route, 유지/제거 결정을 포함한다.

- [ ] **Step 2: Web 대체 route가 존재하는지 `rg --files apps/web/app`로 확인한다**

- [ ] **Step 3: 계획 작성, 기록, 계정/멤버십/가족/지갑은 web-primary로 확정하고 DNR/alarm/idle/tab organizer는 extension-only로 확정한다**

### Task 2: 얇은 Extension navigation contract

**Files:**
- Create: `src/shared/ui/extension-navigation.ts`
- Create: `src/shared/ui/extension-navigation.test.ts`
- Modify: `src/shared/ui/MainShell.tsx`

**Interfaces:**
- Produces: `EXTENSION_NAV_ITEMS`, `webAppUrl(path: string): string`
- Consumes: `VITE_WEB_APP_ORIGIN`

- [ ] **Step 1: Extension nav에 집중/탭 정리/Web 열기만 남는 실패 테스트를 작성한다**

```ts
expect(EXTENSION_NAV_ITEMS.map((item) => item.id)).toEqual(["focus", "tabs", "web"]);
expect(webAppUrl("/focus")).toBe("http://localhost:3000/focus");
```

- [ ] **Step 2: 테스트 실패를 확인한다**

Run: `npx vitest run src/shared/ui/extension-navigation.test.ts`

- [ ] **Step 3: exact http/https origin만 허용하는 navigation helper를 구현한다**

invalid/wildcard origin은 throw하고 경로는 `/`로 시작하도록 정규화한다.

- [ ] **Step 4: MainShell에서 Today/Plan/Reports/Settings/Help/Writing 화면을 제거한다**

Focus 상태와 TabOrganizerCard를 유지하고, Web 버튼은 `/home`, `/focus`, `/history`, `/my`로 이동할 수 있게 한다.

- [ ] **Step 5: 테스트와 typecheck를 통과시킨다**

Run: `npx vitest run src/shared/ui/extension-navigation.test.ts && npm run typecheck`

### Task 3: Popup을 세션 제어 중심으로 축소

**Files:**
- Modify: `src/popup/PopupApp.tsx`
- Test: `src/features/focus/focus.test.ts`

- [ ] **Step 1: active session이 없을 때 웹 계획 페이지로 안내하는 상태 테스트를 추가한다**

순수 helper는 `popupPrimaryAction(hasSession)`으로 만들고 `false`일 때 `{ label: "웹에서 집중 계획 만들기", path: "/focus" }`를 반환한다.

- [ ] **Step 2: 실패를 확인한 뒤 helper와 UI를 구현한다**

Popup에서 오늘 달성률과 Extension 로컬 일정 시작 UI를 제거하고 active session 제어, 탭 정리, 웹 열기만 유지한다.

- [ ] **Step 3: popup 관련 테스트와 typecheck를 실행한다**

Run: `npx vitest run src/features/focus/focus.test.ts && npm run typecheck`

### Task 4: 중복 UI 모듈 연결 해제와 dead-code 확인

**Files:**
- Modify: `src/shared/ui/Root.tsx`
- Inspect/Delete only when unreferenced: `src/features/dashboard/TodayPage.tsx`
- Inspect/Delete only when unreferenced: `src/features/schedules/PlanPage.tsx`
- Inspect/Delete only when unreferenced: `src/features/schedules/ScheduleForm.tsx`
- Inspect/Delete only when unreferenced: `src/features/reports/ReportsPage.tsx`
- Inspect/Delete only when unreferenced: `src/features/membership/MembershipCard.tsx`
- Inspect/Delete only when unreferenced: `src/features/cloud-sync/CloudSyncCard.tsx`
- Inspect/Delete only when unreferenced: `src/features/writing-assistant/WritingAssistantPage.tsx`

- [ ] **Step 1: `rg`로 production import가 없는 UI 파일만 확정한다**

- [ ] **Step 2: background/message/storage에서 사용되는 service, type, helper는 유지한 채 unreferenced React UI만 삭제한다**

- [ ] **Step 3: onboarding은 로그인/웹 연결에 필요한지 확인하고 대체 화면 없이는 삭제하지 않는다**

- [ ] **Step 4: lint, typecheck, Extension build를 실행한다**

Run: `npm run lint && npm run typecheck && npm run build`

### Task 5: Enforcement 회귀 검증

**Files:**
- Verify only

- [ ] **Step 1: background와 web bridge 테스트를 실행한다**

Run: `npx vitest run src/background src/features/web-bridge src/shared/storage/migrations.test.ts`

- [ ] **Step 2: 전체 테스트를 실행한다**

Run: `npm test`

- [ ] **Step 3: production manifest에 exact production origin과 필수 Chrome permission이 유지되는지 확인한다**

Run: `npm run build`

- [ ] **Step 4: 배경 파일이 삭제 또는 무관하게 수정되지 않았는지 diff를 확인한다**

Run: `git diff -- src/background src/features/web-bridge src/shared/types src/shared/storage public/manifest.json`

