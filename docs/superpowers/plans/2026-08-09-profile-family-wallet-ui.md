# Profile, Family, and Wallet UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full-or-custom earned-point cashout, a 300,000P Toss sandbox preset, profile names, guardian-visible student names, role-correct family-link controls, and visually consistent guardian screens.

**Architecture:** Server route wrappers load each user's own profile, while one narrow authenticated PostgreSQL RPC exposes only active linked-student IDs, display names, and link timestamps to guardians. Wallet amounts are validated independently in the web domain, Edge Function parser, and PostgreSQL order RPC; role-specific family components keep issue and redeem actions separate.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Vitest, Supabase SSR/PostgreSQL/RLS/Edge Functions, Toss Payments SDK v2.

## Global Constraints

- Cashout remains a sandbox state transition with no bank data or real transfer.
- Only `earnedAvailable` can be cashed out; topup points remain ineligible.
- Toss remains in test mode and accepts only `test_ck_`, `test_sk_`, and `TOSS_PAYMENT_MODE=test`.
- Topup presets are exactly `10000`, `30000`, `50000`, `100000`, `150000`, and `300000`.
- Guardians issue family codes; students redeem them.
- Guardian linked-student reads expose only student ID, `display_name`, and `linked_at` from active links.
- Existing active links, wallet transactions, and unrelated dirty-worktree changes must be preserved.

---

### Task 1: Add full-balance or custom cashout selection

**Files:**
- Modify: `apps/web/features/wallet/cashout.ts`
- Modify: `apps/web/features/wallet/cashout.test.ts`
- Modify: `apps/web/features/wallet/cashout-panel.tsx`

**Interfaces:**
- Produces: `cashoutFullAmount(available: number): string`.
- Consumes: existing `parseCashoutPoints(value, available)` and server-provided `earnedAvailable`.

- [ ] **Step 1: Write the failing full-amount tests**

```ts
expect(cashoutFullAmount(12_345)).toBe("12345");
expect(() => cashoutFullAmount(0)).toThrow("환급 가능");
expect(() => cashoutFullAmount(-1)).toThrow("환급 가능");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test --workspace @mirujima/web -- features/wallet/cashout.test.ts`

Expected: FAIL because `cashoutFullAmount` is not exported.

- [ ] **Step 3: Implement the domain helper**

```ts
export function cashoutFullAmount(available: number): string {
  if (!Number.isSafeInteger(available) || available < 1) {
    throw new Error("환급 가능한 earned 포인트가 없습니다.");
  }
  return String(available);
}
```

- [ ] **Step 4: Add the visible selection controls**

Keep the numeric input editable. Add `직접 입력` and `전액 선택` buttons above it. `전액 선택` calls `setAmount(cashoutFullAmount(wallet.earnedAvailable))`; `직접 입력` clears the value and focuses the input. Disable full selection and submission when `earnedAvailable === 0`. Keep the existing server request unchanged.

- [ ] **Step 5: Verify and commit**

```bash
npm test --workspace @mirujima/web -- features/wallet/cashout.test.ts
npm run typecheck --workspace @mirujima/web
git add apps/web/features/wallet/cashout.ts apps/web/features/wallet/cashout.test.ts apps/web/features/wallet/cashout-panel.tsx
git commit -m "feat: add full balance cashout selection"
```

---

### Task 2: Add the 300,000P test topup contract

**Files:**
- Modify: `apps/web/features/wallet/topup.ts`
- Modify: `apps/web/features/wallet/topup.test.ts`
- Modify: `supabase/functions/_shared/toss.ts`
- Modify: `supabase/functions/_shared/toss.test.ts`
- Create: `supabase/migrations/202608090008_guardian_profile_and_300k_topup.sql`
- Create: `supabase/tests/database/profile_family_wallet_ui.test.sql`

**Interfaces:**
- Extends: `TOPUP_PRESETS` with `300_000`.
- Extends: Edge `TOPUP_PRESETS` with `300_000`.
- Replaces: `public.create_topup_payment_order(uuid,bigint,text)` with the six-value allowlist.

- [ ] **Step 1: Change tests before production contracts**

Web expectation:

```ts
expect(TOPUP_PRESETS).toEqual([10_000, 30_000, 50_000, 100_000, 150_000, 300_000]);
expect(selectTopupPreset(300_000)).toBe(300_000);
expect(() => selectTopupPreset(200_000)).toThrow("충전 금액");
```

Edge expectation:

```ts
expect(parseTopupOrderRequest({ points: 300000, idempotencyKey: "topup-order:300k" }).points).toBe(300000);
expect(() => parseTopupOrderRequest({ points: 200000, idempotencyKey: "topup-order:200k" })).toThrow("충전 금액");
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test --workspace @mirujima/web -- features/wallet/topup.test.ts
npx vitest run supabase/functions/_shared/toss.test.ts
```

Expected: the 300,000P assertions fail against the five-value lists.

- [ ] **Step 3: Extend both TypeScript allowlists**

Use the exact ordered array:

```ts
[10_000, 30_000, 50_000, 100_000, 150_000, 300_000]
```

Do not add an editable topup amount field.

- [ ] **Step 4: Add migration `202608090008` topup replacement**

Append this complete replacement to migration `202608090008`:

```sql
create or replace function public.create_topup_payment_order(p_user_id uuid,p_points bigint,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  prior public.wallet_transactions%rowtype;
  row_value public.wallet_transactions%rowtype;
  order_id text;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if p_points not in (10000,30000,50000,100000,150000,300000) then
    raise exception 'unsupported topup amount';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid idempotency key';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('topup:'||p_user_id::text,0));
  select * into prior from public.wallet_transactions where idempotency_key=p_idempotency_key;
  if prior.id is not null then
    if prior.kind<>'topup_requested' or prior.to_user_id<>p_user_id or prior.points<>p_points then
      raise exception 'idempotency key mismatch';
    end if;
    return jsonb_build_object('orderId',prior.provider_order_id,'amount',prior.krw_amount,'points',prior.points,'orderName',prior.metadata->>'orderName');
  end if;
  order_id := 'mirujima_topup_'||replace(gen_random_uuid()::text,'-','');
  insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,krw_amount,provider,provider_order_id,idempotency_key,metadata)
  values('topup_requested','pending',null,p_user_id,'external','topup',p_points,p_points,'toss',order_id,p_idempotency_key,
    jsonb_build_object('orderName','Mirujima '||to_char(p_points,'FM999,999,999')||'P 충전','sandbox',true))
  returning * into row_value;
  return jsonb_build_object('orderId',order_id,'amount',p_points,'points',p_points,'orderName',row_value.metadata->>'orderName');
end; $$;

revoke all on function public.create_topup_payment_order(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.create_topup_payment_order(uuid,bigint,text) to service_role;
```

- [ ] **Step 5: Add initial pgTAP assertions**

In `profile_family_wallet_ui.test.sql`, create one guardian fixture and assert that `create_topup_payment_order(...,300000,...)` returns `300000`, while `200000` raises `unsupported topup amount`. Run `npx supabase test db` if Docker is available; otherwise record the limitation.

- [ ] **Step 6: Verify and commit**

```bash
npm test --workspace @mirujima/web -- features/wallet/topup.test.ts
npx vitest run supabase/functions/_shared/toss.test.ts
npm run typecheck
git add apps/web/features/wallet/topup.ts apps/web/features/wallet/topup.test.ts supabase/functions/_shared/toss.ts supabase/functions/_shared/toss.test.ts supabase/migrations/202608090008_guardian_profile_and_300k_topup.sql supabase/tests/database/profile_family_wallet_ui.test.sql
git commit -m "feat: add 300k point topup preset"
```

---

### Task 3: Load and format the current profile display name

**Files:**
- Create: `apps/web/features/profile/profile-display.ts`
- Create: `apps/web/features/profile/profile-display.test.ts`
- Create: `apps/web/features/profile/profile-data.ts`
- Create: `apps/web/features/profile/student-my-page.tsx`
- Modify: `apps/web/app/my/page.tsx`
- Modify: `apps/web/app/guardian/my/page.tsx`
- Modify: `apps/web/features/profile/guardian-my-page.tsx`
- Modify: `apps/web/features/profile/guardian-my-cards.ts`

**Interfaces:**
- Produces: `profileDisplayName(value: unknown): string`.
- Produces: `loadOwnDisplayName(userId: string): Promise<string>`.
- Produces: `StudentMyPage({ displayName })` and `GuardianMyPage({ displayName, ... })`.

- [ ] **Step 1: Write the failing display-name test**

```ts
expect(profileDisplayName(" 이도연 ")).toBe("이도연");
expect(profileDisplayName(null)).toBe("이름 미설정");
expect(profileDisplayName("   ")).toBe("이름 미설정");
expect(profileDisplayName("가".repeat(101))).toBe("이름 미설정");
```

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace @mirujima/web -- features/profile/profile-display.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure formatter and server loader**

`profileDisplayName` returns a trimmed 1–100 character name or `이름 미설정`. `loadOwnDisplayName` uses the server Supabase client, selects only `display_name`, filters `.eq("id", userId)`, calls `.maybeSingle()`, and passes the result through the formatter. It never accepts a different target user ID from browser input.

- [ ] **Step 4: Convert the student page to a server wrapper**

Move the complete current JSX, modal state, share state, links, icons, and class names unchanged to `features/profile/student-my-page.tsx`. Rename its export to `StudentMyPage({ displayName }: { displayName: string })`, add only the display-name row, and replace `app/my/page.tsx` with an async server page:

```tsx
const { user } = await requireAuthenticatedRole("/my");
return <StudentMyPage displayName={await loadOwnDisplayName(user.id)} />;
```

Render `displayName` as a dedicated row in the 로그인 계정 정보 card.

- [ ] **Step 5: Pass the guardian name from its server route**

`app/guardian/my/page.tsx` loads the authenticated guardian name and passes it into `GuardianMyPage`. Replace the static account-card title model with visible `displayName` content while preserving Google authentication status and guardian role copy.

- [ ] **Step 6: Verify and commit**

```bash
npm test --workspace @mirujima/web -- features/profile/profile-display.test.ts features/profile/guardian-my-page.test.ts
npm run typecheck --workspace @mirujima/web
git add apps/web/app/my/page.tsx apps/web/app/guardian/my/page.tsx apps/web/features/profile
git commit -m "feat: show profile display names"
```

---

### Task 4: Add a minimal guardian linked-student read boundary

**Files:**
- Extend: `supabase/migrations/202608090008_guardian_profile_and_300k_topup.sql`
- Extend: `supabase/tests/database/profile_family_wallet_ui.test.sql`
- Create: `apps/web/features/family/linked-students.ts`
- Create: `apps/web/features/family/linked-students.test.ts`
- Create: `apps/web/features/family/linked-students-data.ts`
- Create: `apps/web/features/family/linked-students-list.tsx`

**Interfaces:**
- Produces SQL: `public.get_guardian_linked_students()` returning `(student_user_id uuid, display_name text, linked_at timestamptz)`.
- Produces TS: `parseLinkedStudents(value: unknown): LinkedStudent[]`.
- Produces server loader: `loadGuardianLinkedStudents(): Promise<{ students: LinkedStudent[]; loadFailed: boolean }>`.
- Produces UI: `LinkedStudentsList({ students, loadFailed })`.

- [ ] **Step 1: Write failing parser tests**

```ts
expect(parseLinkedStudents([{ student_user_id: STUDENT_ID, display_name: "학생 A", linked_at: ISO }]))
  .toEqual([{ studentUserId: STUDENT_ID, displayName: "학생 A", linkedAt: ISO }]);
expect(parseLinkedStudents([{ student_user_id: "bad", display_name: "학생", linked_at: ISO }])).toEqual([]);
expect(maskStudentId(STUDENT_ID)).toBe("71111111…1111");
```

- [ ] **Step 2: Verify RED, then implement the parser**

Run: `npm test --workspace @mirujima/web -- features/family/linked-students.test.ts`

Validate UUID, non-empty display name up to 100 characters, and valid ISO timestamps. Sort by display name and then student ID for stable duplicate-name rendering.

- [ ] **Step 3: Add the authenticated SQL RPC**

```sql
create or replace function public.get_guardian_linked_students()
returns table(student_user_id uuid, display_name text, linked_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if coalesce((select role from public.profiles where id=current_user_id),'') <> 'guardian' then
    raise exception 'guardian role required';
  end if;
  return query
    select links.student_user_id, coalesce(nullif(trim(profiles.display_name),''),'이름 미설정'), links.linked_at
    from public.family_links links
    join public.profiles profiles on profiles.id=links.student_user_id
    where links.guardian_user_id=current_user_id and links.status='active'
    order by profiles.display_name nulls last, links.student_user_id;
end; $$;
revoke all on function public.get_guardian_linked_students() from public, anon;
grant execute on function public.get_guardian_linked_students() to authenticated;
```

- [ ] **Step 4: Complete pgTAP coverage**

Assert anonymous execution is denied, a student receives `guardian role required`, a guardian sees only their active students, pending/disconnected rows are excluded, and output has exactly the three declared columns. Do not weaken `profiles` RLS.

- [ ] **Step 5: Implement the server loader and list component**

`loadGuardianLinkedStudents` creates the server Supabase client, invokes `get_guardian_linked_students` without browser-provided IDs, returns parsed rows on success, and returns `{ students: [], loadFailed: true }` on error without exposing the raw error. `LinkedStudentsList` shows `연결된 학생이 없습니다` for a successful empty response. It shows `학생 목록을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.` when `loadFailed` is true. Otherwise it renders `displayName`, masked ID, and localized linked date for each student.

- [ ] **Step 6: Verify and commit**

```bash
npm test --workspace @mirujima/web -- features/family/linked-students.test.ts
npm run typecheck --workspace @mirujima/web
git add apps/web/features/family/linked-students.ts apps/web/features/family/linked-students.test.ts apps/web/features/family/linked-students-data.ts apps/web/features/family/linked-students-list.tsx supabase/migrations/202608090008_guardian_profile_and_300k_topup.sql supabase/tests/database/profile_family_wallet_ui.test.sql
git commit -m "feat: expose linked student display names"
```

---

### Task 5: Make family-link controls role-specific and progressive

**Files:**
- Modify: `apps/web/features/family/family-link.ts`
- Modify: `apps/web/features/family/family-link.test.ts`
- Replace: `apps/web/features/family/family-link-panel.tsx`
- Modify: `apps/web/features/family/family-code-redeemer.tsx`
- Modify: `apps/web/features/profile/student-my-page.tsx`
- Modify: `apps/web/features/profile/guardian-my-page.tsx`
- Modify: `apps/web/app/guardian/my/page.tsx`
- Modify: `apps/web/app/guardian/students/page.tsx`

**Interfaces:**
- Produces: issuer-only `FamilyCodeIssuer`.
- Produces: collapsed-by-default `FamilyCodeRedeemer`.
- Consumes: guardian `displayName`, `LinkedStudent[]`, and `loadFailed` from server loaders.
- Produces: `GuardianMyPage({ displayName, students, studentLoadFailed })`.

- [ ] **Step 1: Add failing surface-state tests**

```ts
expect(FAMILY_ISSUER_ACTIONS).toEqual(["issue", "reissue", "cancel"]);
expect(FAMILY_REDEEMER_ACTIONS).toEqual(["redeem"]);
expect(initialRedeemerExpanded()).toBe(false);
```

Also assert the serialized guardian card model no longer contains a required `/guardian/students` navigation action for code issuance.

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace @mirujima/web -- features/family/family-link.test.ts features/profile/guardian-my-page.test.ts`

Expected: FAIL because the current issuer component still contains redeem UI and the student redeemer is always expanded.

- [ ] **Step 3: Make `FamilyCodeIssuer` issuer-only**

Remove all redeem state, fields, and imports from `family-link-panel.tsx`. Keep only issue, reissue, cancel, countdown, safe Edge error mapping, and the existing card styling. Export only `FamilyCodeIssuer`; do not keep `FamilyLinkPanel` as a combined alias.

- [ ] **Step 4: Collapse the student redeemer by default**

Render a `보호자 연결 코드 입력하기` button initially. Clicking expands the form in place and moves focus to the six-digit field. Render `닫기` inside the expanded header. Successful redemption keeps the safe success copy; no issue button is ever rendered.

- [ ] **Step 5: Embed issuer and linked students in guardian my**

The `연결 학생` card renders `<FamilyCodeIssuer />` directly and then `<LinkedStudentsList />`. Remove the mandatory `학생 관리` navigation CTA from that card. Keep `/guardian/students` accessible from the guardian navigation for detailed management.

- [ ] **Step 6: Load linked students in the server route**

After role validation, call `loadGuardianLinkedStudents()` in both `/guardian/my` and `/guardian/students`. Pass the result to `GuardianMyPage` and `LinkedStudentsList`, respectively. Never pass raw Supabase errors into either component. `/guardian/students` keeps the detailed list and reward-management area; it does not need to be the only place that exposes code issuance.

- [ ] **Step 7: Verify and commit**

```bash
npm test --workspace @mirujima/web -- features/family/family-link.test.ts features/family/linked-students.test.ts features/profile/guardian-my-page.test.ts
npm run typecheck --workspace @mirujima/web
git add apps/web/features/family apps/web/features/profile apps/web/app/guardian/my/page.tsx
git commit -m "feat: refine role specific family linking"
```

---

### Task 6: Unify guardian screens with the student visual system

**Files:**
- Modify: `apps/web/app/guardian/page.tsx`
- Modify: `apps/web/app/guardian/students/page.tsx`
- Modify: `apps/web/app/guardian/history/page.tsx`
- Modify: `apps/web/features/profile/guardian-my-page.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: existing `DashboardShell role="guardian"`, `dashboard-hero`, `dashboard-grid`, `settings-grid`, `metric-grid`, `card`, `sub-card`, and button classes.
- Produces: no new data or server interfaces.

- [ ] **Step 1: Record a structural UI contract test**

Create `apps/web/features/profile/guardian-surface.test.ts` with a pure exported `GUARDIAN_SURFACE_SECTIONS` model and assert exact page sections:

```ts
expect(GUARDIAN_SURFACE_SECTIONS.home).toEqual(["hero", "linked-students", "focus-metrics", "wallet", "family-guide"]);
expect(GUARDIAN_SURFACE_SECTIONS.students).toEqual(["heading", "student-cards", "reward-requests"]);
expect(GUARDIAN_SURFACE_SECTIONS.history).toEqual(["heading", "period-filter", "summary-cards", "history-content"]);
```

- [ ] **Step 2: Verify RED, then add the surface model**

Run: `npm test --workspace @mirujima/web -- features/profile/guardian-surface.test.ts`

Expected: FAIL because the model does not exist. Add the exact model to `guardian-surface.ts`.

- [ ] **Step 3: Apply shared student layout patterns**

- Guardian home uses the same dark Hero dimensions and two/three-column `dashboard-grid` density as student home.
- Students uses the same page heading, cards, empty states, and CTA sizing as student focus/my pages.
- History uses the same period segmented control and four summary metric cards as student history, but its empty-state cards mention only consented aggregate data.
- Guardian my keeps the same six-card `settings-grid` rhythm as student my, with the family-link card allowed to span two columns when needed.

Do not copy student-only navigation, cashout actions, privacy controls, or raw activity details into guardian pages.

- [ ] **Step 4: Add only scoped CSS**

Use `.guardian-*` selectors only where existing shared classes cannot express the layout. Preserve existing design tokens, mobile single-column behavior, and the current student CSS.

- [ ] **Step 5: Verify and commit**

```bash
npm test --workspace @mirujima/web -- features/profile/guardian-surface.test.ts
npm run typecheck --workspace @mirujima/web
npm run lint --workspace @mirujima/web
npm run build --workspace @mirujima/web
git add apps/web/app/guardian apps/web/features/profile/guardian-my-page.tsx apps/web/features/profile/guardian-surface.ts apps/web/features/profile/guardian-surface.test.ts apps/web/app/globals.css
git commit -m "style: unify guardian dashboard screens"
```

---

### Task 7: Deploy and verify the completed flow

**Files:**
- No additional planned source files.

**Interfaces:**
- Consumes: migration `202608090008`, updated `wallet-create-topup-order`, and built web app.
- Produces: remote deployment evidence and local verification evidence.

- [ ] **Step 1: Run the complete local verification suite**

```bash
npm test
npm run typecheck
npm run lint --workspace @mirujima/web
npm run build --workspace @mirujima/web
git diff --check -- apps/web supabase/functions supabase/migrations/202608090008_guardian_profile_and_300k_topup.sql supabase/tests/database/profile_family_wallet_ui.test.sql
```

Record exact test counts. Existing unrelated lint warnings may be reported, but task-owned files must have no new error or warning.

- [ ] **Step 2: Apply and verify the migration**

```bash
npx supabase db push --linked --yes
npx supabase migration list --linked
npx supabase db lint --linked --level error
```

Expected: local and remote both list `202608090008`; remote DB lint returns zero error results.

- [ ] **Step 3: Deploy the changed Edge Function**

```bash
npx supabase functions deploy wallet-create-topup-order --project-ref qhueocvatlgaoupokgmc
npx supabase functions list --project-ref qhueocvatlgaoupokgmc
```

Expected: `wallet-create-topup-order` is `ACTIVE` at a new version. No new secret is set.

- [ ] **Step 4: Perform role-focused browser checks**

- Student `/my`: own display name visible; code input hidden until button click; no code issue action.
- Student `/wallet/cashout`: direct input and full selection both work; 0P disables full selection.
- Guardian `/guardian/my`: own display name, code issuer, and active students by display name visible without leaving the page.
- Guardian pages: guardian navigation remains intact and visual density matches student pages.
- `/wallet/charge`: six fixed buttons including 300,000P; no editable amount input; Toss banner states no real charge.

- [ ] **Step 5: Commit any verification-only corrections**

If browser verification reveals a defect, add a failing regression test, make the minimal fix, rerun Steps 1–4, and commit only that correction with a specific Conventional Commit message. Do not create or push a PR without explicit user authorization.
