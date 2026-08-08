# Cashout Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 계좌정보나 송금 없이 `earned` 포인트만 요청·예약·완료·실패 처리할 수 있는 현금화 샌드박스를 제공한다.

**Architecture:** PostgreSQL의 append-only `wallet_transactions`가 잔액 source of truth이며 security-definer RPC가 advisory lock 안에서 요청과 정산을 처리한다. Supabase Edge Functions는 인증과 `TOSS_PAYMENT_MODE=test`를 강제하고, Next.js Web은 테스트임을 명시한 잔액·신청·처리 UI를 제공한다.

**Tech Stack:** PostgreSQL, Supabase RLS/RPC/Edge Functions, Next.js App Router, React, TypeScript, Vitest, pgTAP

## Global Constraints

- 실제 계좌번호, 예금주, 주민번호, 사업자번호를 입력하거나 저장하지 않는다.
- 현금화 완료는 외부 송금이 아닌 테스트 상태 전환이다.
- `earned` 가용 잔액만 현금화할 수 있고 `topup` 및 일반 `reserved`는 사용할 수 없다.
- 포인트는 양의 integer이며 mutable balance column을 만들지 않는다.
- client의 `wallet_transactions` insert/update/delete를 허용하지 않는다.
- `TOSS_PAYMENT_MODE=test`가 아니면 샌드박스 완료를 fail closed한다.
- 기존 사용자 소유 변경인 `AGENTS.md`, `apps/web/next-env.d.ts`, `supabase/.temp/`는 stage하지 않는다.

---

### Task 1: Append-only wallet and cashout RPCs

**Files:**
- Create: `supabase/migrations/202608090002_cashout_sandbox.sql`
- Create: `supabase/tests/database/cashout_sandbox.test.sql`

**Interfaces:**
- Consumes: `auth.uid()` and authenticated profiles.
- Produces: `wallet_transactions`, `get_wallet_balances()`, `request_test_cashout(bigint,text)`, `complete_test_cashout(uuid,text)`, and `reject_test_cashout(uuid,text)`.

- [ ] **Step 1: Write failing pgTAP tests**

Cover RLS, read-only client access, positive integer constraint, balance aggregation, earned-only eligibility, overdraw rejection, concurrent/idempotent request behavior, completed transfer to external, rejected return to earned, and cross-user denial.

```sql
select has_table('public', 'wallet_transactions', 'wallet ledger exists');
select ok(not has_table_privilege('authenticated', 'public.wallet_transactions', 'INSERT'), 'client cannot insert money rows');
select throws_ok($$ select public.request_test_cashout(0, 'zero') $$, 'P0001');
```

- [ ] **Step 2: Run the focused test to verify it fails**

```bash
npx supabase db reset
npx supabase test db supabase/tests/database/cashout_sandbox.test.sql
```

Expected: FAIL because the ledger and RPCs do not exist.

- [ ] **Step 3: Implement the immutable ledger**

Create the columns from the approved design. Allow the complete AGENTS.md transaction-kind set so later focus settlement remains additive; this plan directly exercises `self_deposit_earned`, `cashout_requested`, `cashout_completed`, and `cashout_rejected`. Constrain:

```text
kind: topup_requested | topup_confirmed | self_deposit_reserved | self_deposit_earned | self_deposit_returned | guardian_reward_requested | guardian_reward_declined | guardian_deposit_reserved | guardian_reward_released | guardian_deposit_returned | topup_refund_requested | topup_refunded | cashout_requested | cashout_completed | cashout_rejected
status: posted
bucket: earned | cashout_reserved | external
points > 0
krw_amount = points when present
```

Owners may select rows where they are `from_user_id` or `to_user_id`, excluding secret metadata fields through column grants. No authenticated mutation grants exist.

`get_wallet_balances()` returns:

```json
{"earnedAvailable":0,"cashoutReserved":0,"cashoutCompleted":0}
```

`request_test_cashout` uses an idempotency-key advisory lock, recomputes the posted balance inside the transaction, then inserts `earned -> cashout_reserved`. Completion inserts `cashout_reserved -> external`; rejection inserts `cashout_reserved -> earned`. Related request IDs and unique idempotency keys prevent double settlement.

- [ ] **Step 4: Run all database tests**

```bash
npx supabase db reset
npx supabase test db
```

Expected: all pgTAP tests PASS.

- [ ] **Step 5: Commit the ledger**

```bash
git add supabase/migrations/202608090002_cashout_sandbox.sql supabase/tests/database/cashout_sandbox.test.sql
git commit -m "feat: add cashout sandbox ledger"
```

### Task 2: Authenticated cashout Edge Functions

**Files:**
- Create: `supabase/functions/cashout-request/index.ts`
- Create: `supabase/functions/cashout-complete-test/index.ts`
- Create: `supabase/functions/tests/cashout.test.ts`
- Modify: `supabase/functions/_shared/toss.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: Task 1 RPCs and `assertTossTestMode` from the membership plan.
- Produces: endpoints returning `{ requestId, status, points, balances }`.

- [ ] **Step 1: Write failing request validation tests**

```ts
expect(parseCashoutRequest({ points: 1000, idempotencyKey: "cashout-12345678" })).toEqual({ points: 1000, idempotencyKey: "cashout-12345678" });
expect(() => parseCashoutRequest({ points: -1, idempotencyKey: "x" })).toThrow();
```

Also test missing auth, non-integer points, cross-user request IDs, duplicate completion, and production-mode completion rejection.

- [ ] **Step 2: Run the focused test to verify it fails**

```bash
npm test -- supabase/functions/tests/cashout.test.ts
```

Expected: FAIL because the parsers and functions do not exist.

- [ ] **Step 3: Implement request and completion handlers**

`cashout-request` authenticates the user and invokes `request_test_cashout`; it never accepts a user id or bucket from the body. `cashout-complete-test` accepts only `{ requestId, outcome: "completed" | "rejected", idempotencyKey }`, authenticates the same owner, calls `assertTossTestMode`, then invokes `complete_test_cashout` or `reject_test_cashout`. Provider or account fields are not accepted.

Return stable safe error codes:

```text
authentication_required
invalid_cashout_points
insufficient_earned_points
cashout_not_found
cashout_already_settled
test_mode_required
```

- [ ] **Step 4: Run function and database tests**

```bash
npm test -- supabase/functions/tests/cashout.test.ts
npx supabase test db
```

Expected: all tests PASS.

- [ ] **Step 5: Commit cashout functions**

```bash
git add supabase/functions/cashout-request/index.ts supabase/functions/cashout-complete-test/index.ts supabase/functions/tests/cashout.test.ts supabase/functions/_shared/toss.ts supabase/config.toml
git commit -m "feat: add test cashout processing"
```

### Task 3: Web cashout sandbox

**Files:**
- Create: `apps/web/features/wallet/cashout.ts`
- Create: `apps/web/features/wallet/cashout.test.ts`
- Create: `apps/web/features/wallet/cashout-panel.tsx`
- Create: `apps/web/app/wallet/cashout/page.tsx`
- Modify: `apps/web/app/my/page.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `get_wallet_balances`, `cashout-request`, and `cashout-complete-test`.
- Produces: `parseCashoutPoints(string, available): number`, cashout page, and My-page wallet link.

- [ ] **Step 1: Write failing form-domain tests**

```ts
expect(parseCashoutPoints("1000", 2000)).toBe(1000);
expect(() => parseCashoutPoints("0", 2000)).toThrow(/1P/);
expect(() => parseCashoutPoints("2001", 2000)).toThrow(/잔액/);
expect(() => parseCashoutPoints("1.5", 2000)).toThrow(/정수/);
```

- [ ] **Step 2: Run the focused test to verify it fails**

```bash
npm run test --workspace @mirujima/web -- features/wallet/cashout.test.ts
```

Expected: FAIL because the wallet module does not exist.

- [ ] **Step 3: Implement the cashout page**

Server page requires an authenticated user and reads balances through RPC. The client panel renders:

- `현금화 가능 earned 포인트`
- integer-only amount input
- `테스트 현금화 신청`
- `실제 계좌 입금은 발생하지 않습니다`
- current request status
- test-only `완료 상태 재현` and `실패 상태 재현` buttons

Generate idempotency keys with `crypto.randomUUID()` once per submission and retain the key across retry. Disable buttons while a request is pending. Map stable server codes to Korean actions without exposing raw database errors.

Change `/my`의 `포인트 현황` card button to link to `/wallet/cashout`.

- [ ] **Step 4: Run Web checks**

```bash
npm run test --workspace @mirujima/web
npm run typecheck --workspace @mirujima/web
npm run lint --workspace @mirujima/web
npm run build --workspace @mirujima/web
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the cashout UI**

```bash
git add apps/web/features/wallet apps/web/app/wallet/cashout/page.tsx apps/web/app/my/page.tsx apps/web/app/globals.css
git commit -m "feat: add cashout sandbox interface"
```

### Task 4: Cashout end-to-end verification

**Files:**
- Modify only if verification exposes a defect in Task 1-3 files.

**Interfaces:**
- Consumes: complete cashout sandbox.
- Produces: verified ledger invariants and UI behavior.

- [ ] **Step 1: Seed an earned fixture locally with the service role**

Insert a valid three-row fixture chain through the local SQL test setup, not through a public UI or authenticated RPC: `topup_confirmed` moves `10000P` from `external` to `topup`, `self_deposit_reserved` moves it from `topup` to `reserved`, and `self_deposit_earned` moves it from `reserved` to `earned`.

- [ ] **Step 2: Verify the success lifecycle**

Request `3000P`, confirm balances become `earnedAvailable=7000` and `cashoutReserved=3000`, complete it, then confirm `cashoutReserved=0` and `cashoutCompleted=3000`. Refresh and retry both requests; balances must not change again.

- [ ] **Step 3: Verify rejection and isolation**

Reject a separate pending request and confirm its points return to earned. Attempt overdraw, a different user's request ID, a negative amount, and completion with `TOSS_PAYMENT_MODE` unset; each must fail without ledger changes.

- [ ] **Step 4: Run the combined automated suite**

```bash
npx supabase test db
npm test -- supabase/functions/tests/cashout.test.ts
npm run test --workspace @mirujima/web
npm run typecheck --workspace @mirujima/web
npm run lint --workspace @mirujima/web
npm run build --workspace @mirujima/web
```

Expected: every command exits 0.

- [ ] **Step 5: Commit only verification fixes**

If files changed, stage only those exact files and use:

```bash
git commit -m "fix: preserve cashout ledger invariants"
```
