# Guardian Family Link UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보호자 연결 화면을 역할별 올바른 위치로 정리하고 연결 코드 발급 실패를 복구한다.

**Architecture:** 보호자는 `/guardian/my`에서만 코드를 발급하고 학생은 `/my`에서만 입력한다. UI는 학생 마이페이지 카드 패턴을 공유하며, 발급 장애는 client→Edge Function→secret→RPC 경계를 순서대로 확인해 근본 원인만 수정한다.

**Tech Stack:** Next.js 16, React, TypeScript, Vitest, Supabase Edge Functions/PostgreSQL

## Global Constraints

- 보호자 마이페이지는 desktop 3열 × 2행의 6개 동일-span 카드다.
- 연결 코드는 보호자가 발급하고 학생이 입력한다.
- `display_name`으로 여러 학생을 구분한다.
- raw Supabase 오류와 secret은 사용자에게 노출하지 않는다.
- 기존 dirty worktree의 무관한 변경은 수정하거나 stage하지 않는다.

---

### Task 1: 연결 코드 장애의 서버 경계 확인

**Files:**
- Inspect: `supabase/functions/family-link-issue/index.ts`
- Inspect: `supabase/functions/_shared/family-code.ts`
- Inspect: `supabase/functions/_shared/origin.ts`
- Test: `supabase/functions/_shared/origin.test.ts`

**Interfaces:**
- Consumes: `MIRUJIMA_ALLOWED_ORIGINS`, `MIRUJIMA_SERVER_SIGNING_SECRET`, `issue_family_link_code(uuid,text)`
- Produces: 확인된 단일 원인과 정상 배포된 `family-link-issue`

- [ ] **Step 1: 원격 secret 이름과 함수 배포 상태를 읽기 전용으로 확인한다**

Run: `npx supabase secrets list --project-ref qhueocvatlgaoupokgmc`

Expected: `MIRUJIMA_ALLOWED_ORIGINS`, `MIRUJIMA_SERVER_SIGNING_SECRET` 존재 여부를 확인한다.

- [ ] **Step 2: origin 경계 테스트를 실행한다**

Run: `npx vitest run supabase/functions/_shared/origin.test.ts`

Expected: exact localhost/production origin만 PASS한다.

- [ ] **Step 3: 누락 설정만 보완한다**

`MIRUJIMA_ALLOWED_ORIGINS`가 없으면 정확히 `https://mirujima.vercel.app,http://localhost:3000,http://127.0.0.1:3000`을 설정한다. signing secret이 없으면 32-byte random 값을 생성해 Supabase Secret에만 설정한다.

- [ ] **Step 4: 함수를 재배포하고 원격 OPTIONS 경계를 확인한다**

Run: `npx supabase functions deploy family-link-issue --project-ref qhueocvatlgaoupokgmc`

Expected: localhost Origin OPTIONS는 200, 미허용 origin은 403이다.

### Task 2: 안전한 Edge Function 오류 해석

**Files:**
- Modify: `apps/web/features/family/family-link.ts`
- Test: `apps/web/features/family/family-link.test.ts`

**Interfaces:**
- Consumes: Supabase `FunctionsHttpError.context`
- Produces: `safeFunctionErrorCode(error: unknown): Promise<string>`

- [ ] **Step 1: Response body와 이미 파싱된 body 양쪽을 읽는 실패 테스트를 작성한다**

```ts
it("reads a safe error code from a function response", async () => {
  const error = { context: new Response(JSON.stringify({ error: "origin_not_allowed" })) };
  expect(await safeFunctionErrorCode(error)).toBe("origin_not_allowed");
});
```

- [ ] **Step 2: 테스트가 현재 `unknown`으로 실패하는지 확인한다**

Run: `npm --workspace apps/web test -- features/family/family-link.test.ts`

- [ ] **Step 3: context가 `Response`이면 clone 후 json을 읽고, 객체면 json 메서드나 body의 안전 코드만 허용한다**

허용 목록 밖 문자열, raw message, status text는 항상 `unknown`으로 정규화한다.

- [ ] **Step 4: family link 테스트를 통과시킨다**

Run: `npm --workspace apps/web test -- features/family/family-link.test.ts`

### Task 3: 역할별 연결 화면과 학생 코드 입력 UI

**Files:**
- Modify: `apps/web/app/guardian/page.tsx`
- Modify: `apps/web/app/guardian/students/page.tsx`
- Modify: `apps/web/features/family/family-code-redeemer.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/features/navigation/navigation.test.ts`
- Test: `apps/web/features/family/family-link.test.ts`

**Interfaces:**
- Consumes: `/guardian/my`, 6자리 numeric code
- Produces: `familyCodeDigits(value: string): string[]`

- [ ] **Step 1: 6개 시각 셀의 값과 역할별 이동 경로를 검증하는 실패 테스트를 작성한다**

```ts
expect(familyCodeDigits("12")).toEqual(["1", "2", "0", "0", "0", "0"]);
expect(guardianFamilyLinkHref()).toBe("/guardian/my");
```

- [ ] **Step 2: 대상 테스트가 실패하는지 확인한다**

Run: `npm --workspace apps/web test -- features/family/family-link.test.ts features/navigation/navigation.test.ts`

- [ ] **Step 3: 보호자 학생 탭에서 issuer와 발급 안내 문구를 제거하고 홈 CTA를 `/guardian/my`로 고정한다**

홈 CTA 문구는 `연결 코드 입력하기`, 아이콘은 우측 화살표를 사용한다.

- [ ] **Step 4: 학생 redeemer에 6칸 표시와 아래쪽 화살표를 적용한다**

단일 input은 `inputMode=numeric`, `pattern=[0-9]{6}`, `maxLength=6`, `autoComplete=one-time-code`를 유지하며 visual cells는 `aria-hidden=true`로 둔다.

- [ ] **Step 5: 테스트와 typecheck를 통과시킨다**

Run: `npm --workspace apps/web test -- features/family/family-link.test.ts features/navigation/navigation.test.ts && npm --workspace apps/web run typecheck`

### Task 4: 보호자 마이페이지 3×2 카드 통일

**Files:**
- Modify: `apps/web/features/profile/guardian-my-page.tsx`
- Modify: `apps/web/features/profile/guardian-my-cards.ts`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/features/profile/guardian-my-page.test.ts`

**Interfaces:**
- Consumes: `displayName`, `LinkedStudent[]`, `FamilyCodeIssuer`
- Produces: 정확히 6개인 `GUARDIAN_MY_CARDS`

- [ ] **Step 1: 6개 카드가 모두 span 1이고 학생 카드와 같은 account/membership/wallet 구조를 요구하는 실패 테스트를 작성한다**

```ts
expect(GUARDIAN_MY_CARDS).toHaveLength(6);
expect(GUARDIAN_MY_CARDS.every((card) => card.gridSpan === 1)).toBe(true);
```

- [ ] **Step 2: 테스트가 `gridSpan` 누락으로 실패하는지 확인한다**

Run: `npm --workspace apps/web test -- features/profile/guardian-my-page.test.ts`

- [ ] **Step 3: guardian page를 학생 page와 동일한 card/sub-card/badge/button 구성으로 렌더링한다**

`guardian-family-card`의 2-column span을 제거한다. 계정 카드에는 Google 상태, 이름, `보호자 (Guardian)`을 표시하고, 멤버십/지갑 카드는 학생과 같은 정보 밀도와 액션 배치를 사용한다.

- [ ] **Step 4: 연결 학생 카드는 issuer와 display_name 목록을 함께 렌더링한다**

연결 목록 실패와 빈 상태의 기존 안전 문구를 보존한다.

- [ ] **Step 5: 테스트, typecheck, build를 실행한다**

Run: `npm --workspace apps/web test -- features/profile/guardian-my-page.test.ts && npm --workspace apps/web run typecheck && npm --workspace apps/web run build`

### Task 5: 전체 회귀 검증

**Files:**
- Verify only

- [ ] **Step 1: 전체 테스트를 실행한다**

Run: `npm test`

- [ ] **Step 2: 전체 typecheck와 production build를 실행한다**

Run: `npm run typecheck && npm run build && npm --workspace apps/web run build`

- [ ] **Step 3: 변경 파일만 검토한다**

Run: `git diff -- apps/web/app/guardian/page.tsx apps/web/app/guardian/students/page.tsx apps/web/features/family apps/web/features/profile apps/web/app/globals.css supabase/functions/family-link-issue`

