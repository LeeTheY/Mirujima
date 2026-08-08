# Toss Point Topup and Cashout Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five fixed-amount Toss sandbox point topups and make earned-point cashout failures observable and reliable without enabling real charges or transfers.

**Architecture:** Keep Premium and wallet products separate while reusing the Toss HTTP boundary. Store pending topup orders and posted confirmations in the existing `wallet_transactions` ledger, validate every amount on the server, and expose topup/cashout changes only through authenticated Edge Functions backed by service-role-only RPCs.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Vitest, Toss Payments SDK v2, Supabase Edge Functions, PostgreSQL/RLS/pgTAP.

## Global Constraints

- Toss must remain in test mode; only `test_ck_` and `test_sk_` keys are accepted.
- Topup presets are exactly `10000`, `30000`, `50000`, `100000`, and `150000` points/KRW.
- User-entered topup amounts are not supported.
- Only posted `topup_confirmed` transactions increase `topupAvailable`.
- Only `earnedAvailable` can move into cashout; topup points cannot be cashed out.
- Cashout completion remains a sandbox state transition with no bank data or real transfer.
- Preserve unrelated dirty-worktree changes and stage only task-owned files.

---

### Task 1: Define topup web-domain contracts

**Files:**
- Create: `apps/web/features/wallet/topup.ts`
- Create: `apps/web/features/wallet/topup.test.ts`

**Interfaces:**
- Produces: `TOPUP_PRESETS`, `TopupPreset`, `parseTopupOrder`, `parseTopupCallback`, `topupFailureCopy`.
- Consumes: standard `URLSearchParams`; no backend dependencies.

- [ ] **Step 1: Write the failing domain tests**

```ts
import { describe, expect, it } from "vitest";
import { TOPUP_PRESETS, parseTopupCallback, parseTopupOrder, topupFailureCopy } from "./topup";

describe("wallet topup domain", () => {
  it("offers only the five approved presets", () => {
    expect(TOPUP_PRESETS).toEqual([10_000, 30_000, 50_000, 100_000, 150_000]);
  });

  it("accepts only server orders with an approved amount", () => {
    expect(parseTopupOrder({ orderId: "mirujima_topup_123456", amount: 30_000, points: 30_000, orderName: "Mirujima 30,000P 충전" }))
      .toEqual({ orderId: "mirujima_topup_123456", amount: 30_000, points: 30_000, orderName: "Mirujima 30,000P 충전" });
    expect(() => parseTopupOrder({ orderId: "x", amount: 20_000, points: 20_000, orderName: "bad" })).toThrow("충전 주문");
  });

  it("rejects callback amount tampering", () => {
    expect(parseTopupCallback(new URLSearchParams("paymentKey=payment_123&orderId=mirujima_topup_123456&amount=50000")))
      .toEqual({ paymentKey: "payment_123", orderId: "mirujima_topup_123456", amount: 50_000 });
    expect(() => parseTopupCallback(new URLSearchParams("paymentKey=payment_123&orderId=mirujima_topup_123456&amount=20000"))).toThrow("결제 결과");
  });

  it("maps provider codes without exposing raw messages", () => {
    expect(topupFailureCopy("PAY_PROCESS_CANCELED")).toContain("취소");
    expect(topupFailureCopy("raw provider error")).toBe("포인트 충전을 완료하지 못했습니다. 다시 시도해 주세요.");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test --workspace @mirujima/web -- features/wallet/topup.test.ts`

Expected: FAIL because `./topup` does not exist.

- [ ] **Step 3: Implement the minimal topup domain module**

```ts
export const TOPUP_PRESETS = [10_000, 30_000, 50_000, 100_000, 150_000] as const;
export type TopupPreset = typeof TOPUP_PRESETS[number];

export function isTopupPreset(value: unknown): value is TopupPreset {
  return typeof value === "number" && TOPUP_PRESETS.includes(value as TopupPreset);
}

export interface TopupOrder {
  orderId: string;
  amount: TopupPreset;
  points: TopupPreset;
  orderName: string;
}

export function parseTopupOrder(value: unknown): TopupOrder {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (typeof item.orderId !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(item.orderId)
    || !isTopupPreset(item.amount) || item.points !== item.amount
    || item.orderName !== `Mirujima ${item.amount.toLocaleString("en-US")}P 충전`) {
    throw new Error("충전 주문이 올바르지 않습니다.");
  }
  return item as unknown as TopupOrder;
}

export function parseTopupCallback(params: URLSearchParams) {
  const paymentKey = params.get("paymentKey")?.trim() ?? "";
  const orderId = params.get("orderId")?.trim() ?? "";
  const amount = Number(params.get("amount"));
  if (paymentKey.length < 6 || paymentKey.length > 200
    || !/^[A-Za-z0-9_-]{6,64}$/.test(orderId) || !isTopupPreset(amount)) {
    throw new Error("결제 결과가 올바르지 않습니다.");
  }
  return { paymentKey, orderId, amount };
}
```

Add `topupFailureCopy` with explicit branches for `PAY_PROCESS_CANCELED`, `PAY_PROCESS_ABORTED`, and `REJECT_CARD_COMPANY`; all other values return the generic Korean copy from the test.

- [ ] **Step 4: Run the focused test and web typecheck**

Run:

```bash
npm test --workspace @mirujima/web -- features/wallet/topup.test.ts
npm run typecheck --workspace @mirujima/web
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit the domain boundary**

```bash
git add apps/web/features/wallet/topup.ts apps/web/features/wallet/topup.test.ts
git commit -m "feat: define wallet topup presets"
```

---

### Task 2: Add topup ledger orders and confirmation RPCs

**Files:**
- Create: `supabase/migrations/202608090006_toss_wallet_topup.sql`
- Modify: `supabase/tests/database/cashout_sandbox.test.sql`
- Create: `supabase/tests/database/toss_wallet_topup.test.sql`

**Interfaces:**
- Produces: `public.create_topup_payment_order(uuid,bigint,text)`, `public.claim_topup_payment(uuid,text,text,bigint)`, `public.confirm_toss_topup_payment(uuid,text,text,jsonb)`, `public.fail_topup_payment(uuid,text,text)`.
- Extends: `public.get_wallet_balances(uuid)` with `topupAvailable`.
- Consumes: existing `wallet_transactions`, `auth.users`, advisory-lock pattern, and service-role-only grants.

- [ ] **Step 1: Write failing pgTAP tests**

Create a transactional pgTAP test that:

```sql
select plan(14);
select has_function('public', 'create_topup_payment_order', array['uuid','bigint','text']);
select has_function('public', 'claim_topup_payment', array['uuid','text','text','bigint']);
select has_function('public', 'confirm_toss_topup_payment', array['uuid','text','text','jsonb']);
select has_function('public', 'fail_topup_payment', array['uuid','text','text']);
```

Insert one `auth.users` fixture, verify all five presets create pending orders, verify `20000` raises `unsupported topup amount`, verify repeated idempotency returns the same `orderId`, verify a callback mismatch raises, and verify duplicate confirmation produces exactly one posted `topup_confirmed` row and `topupAvailable = amount`. Add a cashout assertion proving a topup-only user still has `earnedAvailable = 0` and cannot call `request_test_cashout` for `1P`.

- [ ] **Step 2: Run database tests and verify RED when Docker is available**

Run: `npx supabase test db`

Expected: new topup tests fail because the RPCs do not exist. If Docker is unavailable, record that constraint and rely on remote migration execution plus the existing static SQL review; do not claim pgTAP passed.

- [ ] **Step 3: Implement the additive ledger migration**

In `202608090006_toss_wallet_topup.sql`:

1. Replace `wallet_transactions_status_check` so status accepts `pending`, `confirming`, `posted`, and `failed`.
2. Add a unique partial index on non-null `provider_order_id`.
3. Add a unique partial index on `related_transaction_id` where `kind = 'topup_confirmed'`.
4. Update `get_wallet_balances` to aggregate posted `external → topup` points as `topupAvailable` and preserve existing earned/cashout fields.
5. Implement `create_topup_payment_order` with an advisory lock, exact preset validation, `points = krw_amount`, provider `toss`, order name `Mirujima N P 충전`, and a `pending` `topup_requested` row.
6. Implement `claim_topup_payment` to lock the order, verify owner/order/amount, reject conflicting payment keys, and move only pending rows to `confirming`.
7. Implement `confirm_toss_topup_payment` to validate sanitized provider JSON, insert one posted `topup_confirmed` row related to the request, and return balances.
8. Implement `fail_topup_payment` to mark only non-posted requests failed with a bounded safe failure code.
9. Revoke all four mutation RPCs from `public`, `anon`, and `authenticated`; grant execute only to `service_role`.

Do not add a new table: the pending request and posted confirmation fit the existing ledger and preserve the single financial source of truth.

- [ ] **Step 4: Validate SQL formatting and apply it to the linked database**

Run:

```bash
git diff --check -- supabase/migrations/202608090006_toss_wallet_topup.sql supabase/tests/database/toss_wallet_topup.test.sql supabase/tests/database/cashout_sandbox.test.sql
npx supabase db push --linked --yes
npx supabase migration list --linked
```

Expected: migration `202608090006` exists on both local and remote lists.

- [ ] **Step 5: Commit the database boundary**

```bash
git add supabase/migrations/202608090006_toss_wallet_topup.sql supabase/tests/database/toss_wallet_topup.test.sql supabase/tests/database/cashout_sandbox.test.sql
git commit -m "feat: add toss wallet topup ledger"
```

---

### Task 3: Add topup Edge Functions and decouple cashout sandbox mode

**Files:**
- Modify: `supabase/functions/_shared/toss.ts`
- Modify: `supabase/functions/_shared/toss.test.ts`
- Create: `supabase/functions/wallet-create-topup-order/index.ts`
- Create: `supabase/functions/wallet-confirm-topup/index.ts`
- Modify: `supabase/functions/cashout-request/index.ts`
- Modify: `supabase/functions/cashout-complete-test/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Produces: `parseTopupOrderRequest`, `parseTopupConfirmationRequest`, `assertSandboxTestMode`.
- Reuses: `confirmTossPayment(config,input)` for both Premium and topup expected amounts.
- Exposes: authenticated functions `wallet-create-topup-order`, `wallet-confirm-topup`.

- [ ] **Step 1: Write failing shared-boundary tests**

Add cases proving:

```ts
expect(parseTopupOrderRequest({ points: 10000, idempotencyKey: "topup-order:123" }))
  .toEqual({ points: 10000, idempotencyKey: "topup-order:123" });
expect(() => parseTopupOrderRequest({ points: 20000, idempotencyKey: "topup-order:123" }))
  .toThrow("충전 금액");
expect(assertSandboxTestMode({ TOSS_PAYMENT_MODE: "test" })).toBeUndefined();
expect(() => assertSandboxTestMode({ TOSS_PAYMENT_MODE: "live" })).toThrow("테스트 모드");
```

Change the Toss confirmation test so `confirmTossPayment` accepts the caller-provided expected amount rather than forcing `PREMIUM_PRICE_KRW`; membership parsing must still force `12_900`.

- [ ] **Step 2: Run the focused shared test and verify RED**

Run: `npx vitest run supabase/functions/_shared/toss.test.ts`

Expected: FAIL because the topup parsers and sandbox-only assertion do not exist.

- [ ] **Step 3: Implement the shared Toss boundary**

Keep `assertTossTestMode` unchanged for real Toss API calls. Add `assertSandboxTestMode` that checks only `TOSS_PAYMENT_MODE === "test"`. Remove the Premium-only amount assertion from `confirmTossPayment`; require a positive safe integer and let membership/topup request parsers enforce their own product amounts.

- [ ] **Step 4: Implement the order and confirmation functions**

`wallet-create-topup-order` must authenticate, parse `{ points, idempotencyKey }`, call `create_topup_payment_order`, and return only `{ orderId, amount, points, orderName }`.

`wallet-confirm-topup` must authenticate, parse callback input, assert `test_sk_`, claim the stored order, call Toss confirm with `Idempotency-Key: topup-confirm:<orderId>`, confirm the RPC, and return `{ status: "confirmed", points, balances }`. On a non-retryable Toss error, call `fail_topup_payment`; map provider errors to `payment_rejected` or `payment_temporarily_unavailable` without returning raw details.

Change both cashout functions to use `assertSandboxTestMode({ TOSS_PAYMENT_MODE })`, because they never call Toss or transfer money. Add safe `console.error` context containing function name and normalized error code only; never log request authorization, payment keys, or secrets.

- [ ] **Step 5: Register and test all functions**

Add `verify_jwt = true` entries for both new functions in `supabase/config.toml`, then run:

```bash
npx vitest run supabase/functions/_shared/toss.test.ts supabase/functions/_shared/cashout.test.ts
npm run typecheck
```

Expected: all selected tests and root typecheck pass.

- [ ] **Step 6: Deploy and verify Edge Functions**

Run:

```bash
npx supabase functions deploy wallet-create-topup-order --project-ref qhueocvatlgaoupokgmc
npx supabase functions deploy wallet-confirm-topup --project-ref qhueocvatlgaoupokgmc
npx supabase functions deploy wallet-summary --project-ref qhueocvatlgaoupokgmc
npx supabase functions deploy cashout-request --project-ref qhueocvatlgaoupokgmc
npx supabase functions deploy cashout-complete-test --project-ref qhueocvatlgaoupokgmc
npx supabase functions list --project-ref qhueocvatlgaoupokgmc
```

Expected: all five functions are `ACTIVE` and the two new slugs are present.

- [ ] **Step 7: Commit the server boundary**

```bash
git add supabase/config.toml supabase/functions/_shared/toss.ts supabase/functions/_shared/toss.test.ts supabase/functions/wallet-create-topup-order/index.ts supabase/functions/wallet-confirm-topup/index.ts supabase/functions/cashout-request/index.ts supabase/functions/cashout-complete-test/index.ts
git commit -m "feat: add toss topup functions"
```

---

### Task 4: Build the fixed-button topup UI and callback routes

**Files:**
- Create: `apps/web/app/wallet/charge/page.tsx`
- Create: `apps/web/app/wallet/charge/success/page.tsx`
- Create: `apps/web/app/wallet/charge/fail/page.tsx`
- Create: `apps/web/features/wallet/topup-panel.tsx`
- Modify: `apps/web/app/my/page.tsx`
- Modify: `apps/web/app/globals.css` to add `.topup-presets`, `.topup-preset`, and `.topup-preset[aria-pressed="true"]` selected-state rules using existing color tokens.

**Interfaces:**
- Consumes: `TOPUP_PRESETS`, `parseTopupOrder`, `parseTopupCallback`, `getTossPublicConfig`, Supabase function invocation.
- Produces: fixed-button charge screen and safe success/failure results.

- [ ] **Step 1: Add a UI contract test before the component**

Extend `topup.test.ts` with a pure selection helper test:

```ts
expect(selectTopupPreset(30_000)).toBe(30_000);
expect(() => selectTopupPreset(20_000)).toThrow("충전 금액");
```

Run the focused test and verify it fails before adding the helper.

- [ ] **Step 2: Implement `TopupPanel`**

Render five `<button type="button">` controls from `TOPUP_PRESETS`, no `<input>` or editable amount field. Default to `30_000P`. On CTA:

1. invoke `wallet-create-topup-order` with the selected points and stable `topup-order:<uuid>` key;
2. validate the returned order;
3. load Toss with `test_ck_`;
4. call `payment.requestPayment({ method: "CARD", amount, orderId, orderName, successUrl, failUrl, customerEmail })`;
5. show safe configuration/order errors and keep the selected amount.

Include visible copy that this is a test payment, causes no real charge, and credits topup points that cannot be cashed out.

- [ ] **Step 3: Implement charge, success, and failure routes**

`/wallet/charge` authenticates and renders the panel. Success parses the callback, invokes `wallet-confirm-topup`, validates `status === "confirmed"`, and displays credited points plus `topupAvailable`. Failure uses `topupFailureCopy(code)` and states that no points were credited.

- [ ] **Step 4: Fix wallet navigation**

Change only the “포인트 충전하기” link in `apps/web/app/my/page.tsx` from `/wallet/cashout` to `/wallet/charge`. Keep earned-point “환급 신청” linked to `/wallet/cashout`.

- [ ] **Step 5: Run web checks**

Run:

```bash
npm test --workspace @mirujima/web
npm run typecheck --workspace @mirujima/web
npm run lint --workspace @mirujima/web
npm run build --workspace @mirujima/web
```

Expected: tests, typecheck, and build exit 0; lint has no new task-owned warning or error.

- [ ] **Step 6: Commit the web topup flow**

```bash
git add apps/web/app/wallet/charge apps/web/features/wallet/topup.ts apps/web/features/wallet/topup.test.ts apps/web/features/wallet/topup-panel.tsx apps/web/app/my/page.tsx apps/web/app/globals.css
git commit -m "feat: add toss point topup interface"
```

---

### Task 5: Make cashout errors observable and accurate

**Files:**
- Modify: `apps/web/features/wallet/cashout.ts`
- Modify: `apps/web/features/wallet/cashout.test.ts`
- Modify: `apps/web/features/wallet/cashout-panel.tsx`
- Modify: `apps/web/app/wallet/cashout/page.tsx`

**Interfaces:**
- Produces: `readFunctionErrorCode(error: unknown): Promise<string>`.
- Consumes: Supabase `FunctionsHttpError.context` response and the normalized server codes from Task 3.

- [ ] **Step 1: Write failing error-boundary tests**

Cover a JSON response `{ error: "insufficient_earned_points" }`, a non-JSON response, a missing context, and `wallet_service_unavailable`. Assert that provider/database raw messages never become UI copy.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test --workspace @mirujima/web -- features/wallet/cashout.test.ts`

Expected: FAIL because the robust function-error reader does not exist.

- [ ] **Step 3: Implement robust error parsing and wallet load errors**

Implement `readFunctionErrorCode(error: unknown): Promise<string>` by checking for an object-shaped `context`, cloning the `Response` before reading JSON, accepting only a string `error` field matching `/^[a-z0-9_]{3,80}$/`, and returning `cashout_failed` for every other shape. Never return response text. Map `wallet_service_unavailable` to “지갑 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.”

In the server page, inspect the `wallet-summary` error instead of silently replacing every failure with zero balances. Render an authenticated service-error notice when summary loading fails so `0P` is not mistaken for a real balance.

- [ ] **Step 4: Verify the cashout interaction locally**

With an authenticated user:

1. request more than earned and confirm the specific insufficient-balance copy;
2. request a valid earned amount and confirm reserved balance increases;
3. complete once and confirm completed balance increases;
4. reject a separate request and confirm earned balance returns;
5. confirm no request changes topup balance.

- [ ] **Step 5: Commit the cashout fix**

```bash
git add apps/web/features/wallet/cashout.ts apps/web/features/wallet/cashout.test.ts apps/web/features/wallet/cashout-panel.tsx apps/web/app/wallet/cashout/page.tsx
git commit -m "fix: surface cashout service failures"
```

---

### Task 6: End-to-end sandbox verification and handoff

**Files:**
- No planned file changes; any verification defect starts a new RED/GREEN cycle in the owning task files.

**Interfaces:**
- Consumes: deployed migration/functions, local or deployed web app, configured `test_ck_`/`test_sk_`.
- Produces: evidence-backed verification report.

- [ ] **Step 1: Verify configuration without printing secrets**

Confirm the web key starts with `test_ck_`, and `supabase secrets list` contains `TOSS_PAYMENT_MODE` and `TOSS_SECRET_KEY`. Do not output key values.

- [ ] **Step 2: Run the complete automated suite**

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm test --workspace @mirujima/web
npm run typecheck --workspace @mirujima/web
npm run lint --workspace @mirujima/web
npm run build --workspace @mirujima/web
npm audit --audit-level=high
```

Record exact test counts, warnings, failures, and audit result.

- [ ] **Step 3: Run browser QA**

Use the Browser plugin on:

```text
/wallet/charge
/wallet/charge/success
/wallet/charge/fail
/wallet/cashout
/my
```

Verify page identity, meaningful DOM, no framework overlay, console health, fixed preset buttons, no amount input, selected state, corrected navigation, and responsive rendering. Exercise one target interaction per page without completing a real charge.

- [ ] **Step 4: Complete one Toss sandbox payment**

Use a Toss-provided test payment method. Confirm only one `topup_confirmed` posted row exists for the order and `topupAvailable` increased by exactly the selected preset. Confirm no actual charge occurred.

- [ ] **Step 5: Complete cashout sandbox checks**

Use earned fixture points or an earned transaction produced by the focus flow. Verify request/completion/rejection and confirm no real transfer occurred.

- [ ] **Step 6: Report deployment boundaries**

State separately:

- Supabase migration deployed or not deployed;
- Edge Functions deployed or not deployed;
- Vercel/web deployed or not deployed;
- branch pushed/merged or still local;
- pgTAP executed or blocked by missing Docker.
