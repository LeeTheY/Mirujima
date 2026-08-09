# Role-Protected Routes and Family Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give guardians their own my page, enforce role ownership on every protected route, and implement guardian-issued/student-redeemed family codes in local and production environments.

**Architecture:** A server-only role guard resolves the authenticated profile before page data or UI renders. Family-link UI is split by role, while PostgreSQL RPCs and Edge Functions independently enforce guardian issuance, student redemption, exact-origin CORS, and safe error codes.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Vitest, Supabase Auth/Edge Functions/PostgreSQL/RLS/pgTAP.

## Global Constraints

- Student-only routes: `/home`, `/focus`, `/history`, `/my`, `/wallet/cashout`.
- Guardian-only routes: `/guardian`, `/guardian/students`, `/guardian/history`, `/guardian/my`.
- Shared authenticated routes: `/membership/*`, `/wallet/charge*`.
- Public routes: `/`, `/onboarding`, `/auth/callback`, `/how`, `/privacy`.
- Guardians issue family codes; students redeem them.
- Existing active family links remain unchanged; existing student-issued pending codes are revoked.
- Allowed origins are exact values only: `https://mirujima.vercel.app` and `http://localhost:3000`.
- No wildcard origins, raw DB errors, code hashes, tokens, or secrets reach the browser.
- Preserve unrelated dirty-worktree changes and stage only task-owned files.

---

### Task 1: Define and test the route access matrix

**Files:**
- Create: `apps/web/features/auth/route-access.ts`
- Create: `apps/web/features/auth/route-access.test.ts`
- Modify: `apps/web/features/navigation/navigation.ts`
- Modify: `apps/web/features/navigation/navigation.test.ts`

**Interfaces:**
- Produces: `routeAccess(pathname: string): "public" | "shared" | UserRole`.
- Produces: `roleRedirect(pathname: string, actualRole: UserRole): string | null`.
- Updates guardian navigation my href to `/guardian/my`.

- [ ] **Step 1: Write failing route-matrix tests**

```ts
expect(roleRedirect("/my", "guardian")).toBe("/guardian/my");
expect(roleRedirect("/guardian/my", "student")).toBe("/my");
expect(roleRedirect("/focus", "guardian")).toBe("/guardian");
expect(roleRedirect("/guardian/students", "student")).toBe("/home");
expect(roleRedirect("/wallet/charge", "guardian")).toBeNull();
expect(routeAccess("/privacy")).toBe("public");
```

Change the guardian navigation expectation to:

```ts
["/guardian", "/guardian/students", "/guardian/history", "/guardian/my"]
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test --workspace @mirujima/web -- features/auth/route-access.test.ts features/navigation/navigation.test.ts
```

Expected: FAIL because the route-access module does not exist and guardian navigation still uses `/my`.

- [ ] **Step 3: Implement the exact route classifier**

Use exact path sets plus prefix checks only for `/membership/` and `/wallet/charge/`. `roleRedirect` returns semantic my-page counterparts first, then guardian `/guardian` or student `/home`; shared/public paths return `null`.

- [ ] **Step 4: Update guardian navigation and rerun tests**

Run the Step 2 command plus `npm run typecheck --workspace @mirujima/web`.

Expected: all selected tests and typecheck exit 0.

- [ ] **Step 5: Commit the route contract**

```bash
git add apps/web/features/auth/route-access.ts apps/web/features/auth/route-access.test.ts apps/web/features/navigation/navigation.ts apps/web/features/navigation/navigation.test.ts
git commit -m "fix: define role protected routes"
```

---

### Task 2: Add the server-only role guard to every protected page

**Files:**
- Create: `apps/web/features/auth/require-role.ts`
- Modify: `apps/web/app/home/page.tsx`
- Modify: `apps/web/app/focus/page.tsx`
- Modify: `apps/web/app/history/page.tsx`
- Modify: `apps/web/app/my/page.tsx`
- Create: `apps/web/features/profile/student-my-page.tsx`
- Modify: `apps/web/app/wallet/cashout/page.tsx`
- Modify: `apps/web/app/guardian/page.tsx`
- Modify: `apps/web/app/guardian/students/page.tsx`
- Modify: `apps/web/app/guardian/history/page.tsx`
- Modify: `apps/web/app/membership/checkout/page.tsx`
- Modify: `apps/web/app/membership/success/page.tsx`
- Modify: `apps/web/app/membership/fail/page.tsx`

**Interfaces:**
- Produces: `requireAuthenticatedRole(pathname: string): Promise<{ user: User; role: UserRole }>`.
- Consumes: `createClient`, `userRoleSchema`, `roleRedirect`, Next.js `redirect`.

- [ ] **Step 1: Add a failing pure-decision test for missing auth/profile role**

Test a small exported `resolveAccess(pathname, userId, profileRole)` decision function: missing user or role returns `/onboarding`; mismatched role uses `roleRedirect`; valid role returns `{ role }`.

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace @mirujima/web -- features/auth/route-access.test.ts`

Expected: FAIL because `resolveAccess` is not implemented.

- [ ] **Step 3: Implement `requireAuthenticatedRole`**

The helper must call `auth.getUser()`, then select only `role` from the matching profile, validate it with `userRoleSchema`, apply the pure access decision, and call `redirect` before returning on every invalid case. It returns the authenticated user and validated role for shared pages.

- [ ] **Step 4: Apply guards before page data access**

Convert protected pages to async server components where required. Move the current client-side `/my` body and modal state into `features/profile/student-my-page.tsx`; keep `app/my/page.tsx` as a server wrapper that guards before rendering it. The first executable statement in each page must await `requireAuthenticatedRole(currentPath)`. Pass the returned role into `DashboardShell`; remove role literals that can disagree with the authenticated profile. Shared payment pages use the returned role to choose `/my` or `/guardian/my` back links.

- [ ] **Step 5: Run web tests, typecheck, and build**

```bash
npm test --workspace @mirujima/web
npm run typecheck --workspace @mirujima/web
npm run build --workspace @mirujima/web
```

Expected: all commands exit 0 and protected routes remain dynamic server routes.

- [ ] **Step 6: Commit route enforcement**

```bash
git add apps/web/features/auth/require-role.ts apps/web/features/auth/route-access.test.ts apps/web/features/profile/student-my-page.tsx apps/web/app/home/page.tsx apps/web/app/focus/page.tsx apps/web/app/history/page.tsx apps/web/app/my/page.tsx apps/web/app/wallet/cashout/page.tsx apps/web/app/guardian apps/web/app/membership
git commit -m "fix: enforce roles on protected pages"
```

---

### Task 3: Build a guardian-specific my page

**Files:**
- Create: `apps/web/app/guardian/my/page.tsx`
- Create: `apps/web/features/profile/guardian-my-page.tsx`
- Create: `apps/web/features/profile/guardian-my-page.test.ts`

**Interfaces:**
- Consumes: validated guardian auth context, `DashboardShell`, `/wallet/charge`, `/membership/checkout`, `/guardian/students`.
- Produces: guardian-only account, wallet, membership, linked-student, family-summary, and reward-request cards.

- [ ] **Step 1: Write a failing card-model contract test**

Export `GUARDIAN_MY_CARDS` from the presentational module and assert its labels are exactly `로그인 계정 정보`, `보호자 지갑`, `멤버십`, `연결 학생`, `가족 활동 요약`, `보상 요청 관리`. Assert its serialized labels and hrefs do not contain `현금 환급`, `공유 범위`, `연결 해제`, or `/wallet/cashout`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test --workspace @mirujima/web -- features/profile/guardian-my-page.test.ts`

Expected: FAIL because the component and card model do not exist.

- [ ] **Step 3: Implement the guardian page**

The route calls `requireAuthenticatedRole("/guardian/my")` before rendering. The presentational component uses `DashboardShell role="guardian" activeHref="/guardian/my"`; charge links point to `/wallet/charge`, membership to `/membership/checkout`, and student management to `/guardian/students`.

- [ ] **Step 4: Verify and commit**

```bash
npm test --workspace @mirujima/web -- features/profile/guardian-my-page.test.ts
npm run typecheck --workspace @mirujima/web
git add apps/web/app/guardian/my/page.tsx apps/web/features/profile/guardian-my-page.tsx apps/web/features/profile/guardian-my-page.test.ts
git commit -m "feat: add guardian my page"
```

---

### Task 4: Enforce guardian-issued family links in PostgreSQL

**Files:**
- Create: `supabase/migrations/202608090006_guardian_issued_family_links.sql`
- Modify: `supabase/tests/database/v3_roles_family_focus.test.sql`

**Interfaces:**
- Replaces behavior of existing `issue_family_link_code(uuid,text)` and `redeem_family_link_code(uuid,text)` signatures.
- Preserves active links and revokes student-issued pending links.

- [ ] **Step 1: Rewrite pgTAP expectations before SQL implementation**

Add assertions that student issuance raises `guardian role required`, guardian issuance returns pending, guardian redemption raises `student role required`, and student redemption activates the guardian-issued row. Add an existing student-issued pending fixture and assert migration logic revokes it without changing active rows.

- [ ] **Step 2: Run pgTAP and verify RED when Docker is available**

Run: `npx supabase test db`

Expected: role-direction tests fail against the symmetric RPC implementation. If Docker is unavailable, record the limitation and do not claim pgTAP passed.

- [ ] **Step 3: Implement migration `202608090006`**

Before replacing functions:

```sql
update public.family_links
set status = 'revoked', code_hash = null, code_expires_at = null, updated_at = now()
where status = 'pending' and issuer_role = 'student';
```

The issue function must require `current_role = 'guardian'` and always insert `guardian_user_id = current_user_id`, `student_user_id = null`, `issuer_role = 'guardian'`. The redeem function must require `current_role = 'student'`, reject self/same-role use, set `student_user_id = current_user_id`, and preserve expiry, single-use, active-guardian uniqueness, failure counts, and advisory locks. Retain service-role-only grants.

- [ ] **Step 4: Deploy and verify migration order**

```bash
npx supabase db push --linked --yes
npx supabase migration list --linked
```

Expected: local and remote both list `202608090006` after `202608090005`.

- [ ] **Step 5: Commit DB changes**

```bash
git add supabase/migrations/202608090006_guardian_issued_family_links.sql supabase/tests/database/v3_roles_family_focus.test.sql
git commit -m "fix: enforce guardian issued family links"
```

---

### Task 5: Add exact multi-origin CORS and safe family errors

**Files:**
- Create: `supabase/functions/_shared/origin.ts`
- Create: `supabase/functions/_shared/origin.test.ts`
- Modify: `supabase/functions/family-link-issue/index.ts`
- Modify: `supabase/functions/family-link-redeem/index.ts`

**Interfaces:**
- Produces: `allowedOrigin(requestOrigin: string, configured: string | undefined): string | null`.
- Consumes: `MIRUJIMA_ALLOWED_ORIGINS` comma-separated exact origins.

- [ ] **Step 1: Write failing origin tests**

```ts
const configured = "https://mirujima.vercel.app,http://localhost:3000";
expect(allowedOrigin("https://mirujima.vercel.app", configured)).toBe("https://mirujima.vercel.app");
expect(allowedOrigin("http://localhost:3000", configured)).toBe("http://localhost:3000");
expect(allowedOrigin("https://preview.vercel.app", configured)).toBeNull();
expect(allowedOrigin("https://mirujima.vercel.app.evil.test", configured)).toBeNull();
```

- [ ] **Step 2: Verify RED then implement exact parsing**

Run: `npx vitest run supabase/functions/_shared/origin.test.ts` and confirm module-not-found failure. Implement URL canonicalization that accepts only `http:`/`https:`, compares `URL.origin`, filters invalid configured entries, and never suffix-matches.

- [ ] **Step 3: Refactor both family functions**

Use `MIRUJIMA_ALLOWED_ORIGINS`, return `origin_not_allowed` before auth, and echo only the matched exact origin. Map role, rate-limit, active-link, invalid/expired, and locked outcomes to the safe codes defined in the spec. Log `{ function, code, status }` only.

- [ ] **Step 4: Set the new secret and deploy**

```bash
npx supabase secrets set MIRUJIMA_ALLOWED_ORIGINS='https://mirujima.vercel.app,http://localhost:3000'
npx supabase functions deploy family-link-issue --project-ref qhueocvatlgaoupokgmc
npx supabase functions deploy family-link-redeem --project-ref qhueocvatlgaoupokgmc
```

Keep `MIRUJIMA_APP_ORIGIN` until deployed functions are verified; unset it only in a later explicit cleanup.

- [ ] **Step 5: Verify OPTIONS and function deployment**

Send OPTIONS requests from both allowed origins and one denied origin. Expected statuses: `200`, `200`, `403`. Run `npx supabase functions list --project-ref qhueocvatlgaoupokgmc` and confirm both functions are ACTIVE with new versions.

- [ ] **Step 6: Commit function changes**

```bash
git add supabase/functions/_shared/origin.ts supabase/functions/_shared/origin.test.ts supabase/functions/family-link-issue/index.ts supabase/functions/family-link-redeem/index.ts
git commit -m "fix: allow exact family link origins"
```

---

### Task 6: Split family-link UI by role and expose real errors

**Files:**
- Replace: `apps/web/features/family/family-link-panel.tsx`
- Create: `apps/web/features/family/family-code-issuer.tsx`
- Create: `apps/web/features/family/family-code-redeemer.tsx`
- Create: `apps/web/features/family/family-link.ts`
- Create: `apps/web/features/family/family-link.test.ts`
- Modify: `apps/web/app/guardian/students/page.tsx`
- Modify: `apps/web/app/my/page.tsx`

**Interfaces:**
- Produces: `familyLinkErrorCopy(code: string): string`, issuer-only and redeemer-only components.
- Consumes: normalized safe Edge Function codes.

- [ ] **Step 1: Write failing copy and role-surface tests**

Assert mappings for all safe codes and generic fallback. Export pure issuer/redeemer surface models and assert issuer actions are `issue`, `reissue`, `cancel` while redeemer actions contain only `redeem`.

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace @mirujima/web -- features/family/family-link.test.ts`

Expected: FAIL because the domain module does not exist.

- [ ] **Step 3: Implement split components**

Move countdown, issue, reissue, and cancel into `FamilyCodeIssuer`. Move six-digit input and redeem into `FamilyCodeRedeemer`. Parse `FunctionsHttpError.context` JSON for an allowlisted error code and display `familyLinkErrorCopy`; do not display raw response text.

- [ ] **Step 4: Mount role-specific surfaces**

`/guardian/students` renders only `FamilyCodeIssuer` plus linked students. Student `/my` renders only `FamilyCodeRedeemer` in its guardian connection card. Delete the combined `FamilyLinkPanel` export after all imports are removed.

- [ ] **Step 5: Run web verification and commit**

```bash
npm test --workspace @mirujima/web
npm run typecheck --workspace @mirujima/web
npm run lint --workspace @mirujima/web
npm run build --workspace @mirujima/web
git add apps/web/features/family apps/web/app/guardian/students/page.tsx apps/web/app/my/page.tsx
git commit -m "fix: split family linking by role"
```

---

### Task 7: Browser QA for route and family boundaries

**Files:**
- No planned source changes; any defect starts a RED/GREEN cycle in its owning task.

**Interfaces:**
- Consumes: local authenticated student and guardian sessions, deployed migration/functions.
- Produces: route-access and family-link QA evidence.

- [ ] **Step 1: Verify guardian routes**

Check `/guardian/my` shows guardian tabs/cards, `/my` redirects to `/guardian/my`, `/focus` redirects to `/guardian`, code issue succeeds locally, and no code-input form is present.

- [ ] **Step 2: Verify student routes**

Check `/my` shows student tabs/cards and code input, `/guardian/my` redirects to `/my`, `/guardian/students` redirects to `/home`, and no code-issue button is present.

- [ ] **Step 3: Verify one complete link**

Issue as guardian, redeem as student within five minutes, verify one active row, verify reuse fails, and confirm only consented aggregate UI is visible to the guardian.

- [ ] **Step 4: Run final automated checks**

```bash
npm test --workspace @mirujima/web
npm run typecheck --workspace @mirujima/web
npm run lint --workspace @mirujima/web
npm run build --workspace @mirujima/web
npm test
npm run typecheck
```

Record exact test counts and distinguish existing unrelated lint warnings from new failures.
