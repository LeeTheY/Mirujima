# Toss Test Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toss Payments SDK v2 테스트 결제로 Premium 1개월권을 승인하고 서버 검증 후 멤버십과 entitlement를 정확히 1개월 활성화한다.

**Architecture:** 결제 UI와 리다이렉트는 Next.js Web이 담당하고, Supabase Edge Functions가 인증·주문 생성·Toss 승인 호출을 담당한다. PostgreSQL RPC가 주문 상태와 멤버십 기간 및 entitlement를 단일 transaction으로 확정하며, Extension은 결제 페이지를 열고 서버 상태를 복구한다.

**Tech Stack:** Next.js App Router, React, TypeScript, `@tosspayments/tosspayments-sdk` v2, Supabase Auth/PostgreSQL/Edge Functions, Vitest, pgTAP

## Global Constraints

- 상품 가격은 서버 상수 `12900 KRW`이며 client callback 금액을 신뢰하지 않는다.
- `TOSS_PAYMENT_MODE=test`와 `test_` secret key를 모두 확인하고 그 외에는 fail closed한다.
- 일반 단건 결제이며 자동 갱신이나 Billing API를 추가하지 않는다.
- 결제 승인 전에는 멤버십과 entitlement를 활성화하지 않는다.
- `VITE_BILLING_INTEGRATION=deferred`와 무료 Premium 활성화 경로를 제거한다.
- 기존 사용자 소유 변경인 `AGENTS.md`, `apps/web/next-env.d.ts`, `supabase/.temp/`는 stage하지 않는다.

---

### Task 1: Membership payment database boundary

**Files:**
- Create: `supabase/migrations/202608090001_toss_test_membership.sql`
- Create: `supabase/tests/database/toss_test_membership.test.sql`
- Modify: `supabase/tests/database/gate_a_membership_rls.test.sql`
- Modify: `supabase/tests/database/gate_b_cloud_sync.test.sql`
- Modify: `supabase/tests/database/gate_d_content_summary.test.sql`

**Interfaces:**
- Consumes: existing `public.memberships`, `public.membership_entitlements`, `auth.uid()`.
- Produces: `public.membership_payment_orders`, `public.create_membership_payment_order(text)`, `public.claim_membership_payment(text,text,bigint)`, `public.confirm_toss_membership_payment(text,text,jsonb)`, `public.fail_membership_payment(text,text)`, and membership period columns.

- [ ] **Step 1: Write failing pgTAP coverage**

Add assertions for the new table, RLS, authenticated read-only access, the `toss`/`toss_payment` constraints, fixed `12900` amount, unique `order_id` and `idempotency_key`, first activation, active-period extension, and duplicate confirmation idempotency. Replace fixtures that call `activate_deferred_membership()` with direct service-role inserts representing an active Toss membership.

Core assertion shape:

```sql
select has_table('public', 'membership_payment_orders', 'membership payment orders exist');
select is((select relrowsecurity from pg_class where oid = 'public.membership_payment_orders'::regclass), true, 'orders use RLS');
select ok(not has_table_privilege('authenticated', 'public.membership_payment_orders', 'INSERT'), 'clients cannot create orders');
select throws_ok(
  $$ insert into public.membership_payment_orders(user_id, order_id, amount_krw, status, idempotency_key)
     values ('11111111-1111-4111-8111-111111111111', 'order_bad_amount', 1, 'pending', 'idem-bad') $$,
  '23514'
);
```

- [ ] **Step 2: Run the database test to verify it fails**

Run:

```bash
npx supabase db reset
npx supabase test db supabase/tests/database/toss_test_membership.test.sql
```

Expected: FAIL because `membership_payment_orders` and Toss RPCs do not exist.

- [ ] **Step 3: Add the migration**

Create the order table with statuses `pending | confirming | confirmed | failed | expired`, owner-select RLS, no authenticated mutation grants, unique provider identifiers, and `amount_krw = 12900`. Add `current_period_started_at`, `current_period_ends_at`, `provider_customer_key`, and `provider_subscription_ref` to `memberships`; extend constraints with `toss` and `toss_payment`.

Implement the RPC signatures exactly:

```sql
public.create_membership_payment_order(p_idempotency_key text) returns jsonb
public.claim_membership_payment(p_order_id text, p_payment_key text, p_callback_amount bigint) returns jsonb
public.confirm_toss_membership_payment(p_order_id text, p_payment_key text, p_provider_payload jsonb) returns jsonb
public.fail_membership_payment(p_order_id text, p_failure_code text) returns jsonb
```

Use `pg_advisory_xact_lock(hashtextextended(..., 0))`. `confirm_toss_membership_payment` sets the period start to `greatest(now(), current_period_ends_at)` and end to `period_start + interval '1 month'`, then upserts all six entitlements with `source='toss_payment'` and the same `valid_until`.

Drop `public.activate_deferred_membership(uuid)` after revoking execute, mark existing `billing_integration='deferred'` memberships inactive, and disable their entitlements. Do not delete rows.

- [ ] **Step 4: Run all database tests**

Run:

```bash
npx supabase db reset
npx supabase test db
```

Expected: all pgTAP files PASS.

- [ ] **Step 5: Commit the database boundary**

```bash
git add supabase/migrations/202608090001_toss_test_membership.sql supabase/tests/database/toss_test_membership.test.sql supabase/tests/database/gate_a_membership_rls.test.sql supabase/tests/database/gate_b_cloud_sync.test.sql supabase/tests/database/gate_d_content_summary.test.sql
git commit -m "feat: add toss membership payment boundary"
```

### Task 2: Toss order and confirmation Edge Functions

**Files:**
- Create: `supabase/functions/_shared/toss.ts`
- Create: `supabase/functions/membership-create-order/index.ts`
- Create: `supabase/functions/membership-confirm-payment/index.ts`
- Create: `supabase/functions/tests/toss.test.ts`
- Modify: `supabase/functions/_shared/membership.ts`
- Modify: `supabase/functions/get-membership-entitlements/index.ts`
- Modify: `supabase/config.toml`
- Delete: `supabase/functions/activate-membership/index.ts`

**Interfaces:**
- Consumes: Task 1 RPCs and existing `authenticatedClient()`.
- Produces: `assertTossTestMode(env): TossTestConfig`, `confirmTossPayment(input, fetcher)`, and JSON endpoints returning `{ orderId, amount, orderName }` and `{ membership }`.

- [ ] **Step 1: Write failing pure-function tests**

Cover rejection of missing/live keys, Basic auth construction without logging the key, callback schema validation, Toss error normalization, and response validation for `orderId`, `paymentKey`, `totalAmount === 12900`, and `status === 'DONE'`.

```ts
it("rejects a live Toss secret in test mode", () => {
  expect(() => assertTossTestMode({ TOSS_PAYMENT_MODE: "test", TOSS_SECRET_KEY: "live_sk_x" })).toThrow();
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

```bash
npm test -- supabase/functions/tests/toss.test.ts
```

Expected: FAIL because `_shared/toss.ts` does not exist.

- [ ] **Step 3: Implement the shared Toss client**

Export:

```ts
export const PREMIUM_PRICE_KRW = 12_900;
export function assertTossTestMode(env: Record<string, string | undefined>): { secretKey: string };
export async function confirmTossPayment(
  input: { paymentKey: string; orderId: string; amount: number; idempotencyKey: string },
  fetcher?: typeof fetch
): Promise<Record<string, unknown>>;
export async function fetchTossPayment(paymentKey: string, fetcher?: typeof fetch): Promise<Record<string, unknown>>;
```

Use `POST https://api.tosspayments.com/v1/payments/confirm`, `Authorization: Basic base64(secret + ':')`, and `Idempotency-Key`. Do not include provider payload or credentials in thrown user-facing messages.

- [ ] **Step 4: Implement authenticated Edge Functions**

`membership-create-order` accepts only an idempotency key, calls `create_membership_payment_order`, and returns the server amount and order name.

`membership-confirm-payment` validates Zod-equivalent runtime shapes, claims the order before network I/O, calls Toss, validates the provider response, then calls `confirm_toss_membership_payment`. For a stale `confirming` order, query Toss first and finalize an already approved payment instead of issuing a new approval. A definitive provider rejection calls `fail_membership_payment`; a timeout leaves the order recoverable as `confirming`. Persist only sanitized fields (`status`, `method`, `approvedAt`, `transactionKey`) rather than full card or customer payloads.

Update `membershipResponse()` to return `currentPeriodStartedAt` and `currentPeriodEndsAt`; treat an elapsed period as inactive even before a cleanup job runs. Remove the deferred activation function registration and add both new functions to `supabase/config.toml`.

- [ ] **Step 5: Run Edge and database regression tests**

```bash
npm test -- supabase/functions/tests/toss.test.ts
npx supabase test db
```

Expected: all tests PASS.

- [ ] **Step 6: Commit server payment functions**

```bash
git add supabase/functions/_shared/toss.ts supabase/functions/_shared/membership.ts supabase/functions/membership-create-order/index.ts supabase/functions/membership-confirm-payment/index.ts supabase/functions/get-membership-entitlements/index.ts supabase/functions/tests/toss.test.ts supabase/config.toml supabase/functions/activate-membership/index.ts
git commit -m "feat: confirm toss test membership payments"
```

### Task 3: Web checkout and redirect results

**Files:**
- Create: `apps/web/features/membership/config.ts`
- Create: `apps/web/features/membership/payment.ts`
- Create: `apps/web/features/membership/payment.test.ts`
- Create: `apps/web/features/membership/checkout.tsx`
- Create: `apps/web/app/membership/checkout/page.tsx`
- Create: `apps/web/app/membership/success/page.tsx`
- Create: `apps/web/app/membership/fail/page.tsx`
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/my/page.tsx`
- Create: `apps/web/.env.example`

**Interfaces:**
- Consumes: `membership-create-order`, `membership-confirm-payment`, and the browser Supabase client.
- Produces: `getTossPublicConfig()`, `parsePaymentCallback(searchParams)`, and accessible checkout/result pages.

- [ ] **Step 1: Write failing config and callback tests**

```ts
expect(() => getTossPublicConfig({ NEXT_PUBLIC_TOSS_CLIENT_KEY: "live_ck_x" })).toThrow(/테스트/);
expect(parsePaymentCallback(new URLSearchParams("paymentKey=p&orderId=o&amount=12900"))).toEqual({ paymentKey: "p", orderId: "o", amount: 12900 });
expect(() => parsePaymentCallback(new URLSearchParams("amount=1"))).toThrow();
```

- [ ] **Step 2: Run the focused test to verify it fails**

```bash
npm run test --workspace @mirujima/web -- features/membership/payment.test.ts
```

Expected: FAIL because the payment modules do not exist.

- [ ] **Step 3: Install and configure Toss SDK v2**

```bash
npm install @tosspayments/tosspayments-sdk --workspace @mirujima/web
```

Add `.env.example` keys `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_...`, and `NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000`. Because this plan uses `tossPayments.payment()`, the matching server key must be the API individual test secret `test_sk_...`; do not mix Payment Widget `test_gck_...`/`test_gsk_...` keys.

- [ ] **Step 4: Implement checkout and result pages**

The client checkout component must authenticate, create a server order, initialize `TossPayments(clientKey).payment({ customerKey: user.id })`, and call:

```ts
await payment.requestPayment({
  method: "CARD",
  amount: { currency: "KRW", value: order.amount },
  orderId: order.orderId,
  orderName: order.orderName,
  successUrl: `${origin}/membership/success`,
  failUrl: `${origin}/membership/fail`,
  customerEmail: user.email ?? undefined,
});
```

The success page confirms through the Edge Function exactly once and renders the returned period end. The fail page maps `code` to safe Korean copy. All three pages display `테스트 결제 · 실제 청구 없음` and `자동 갱신 없음`.

Replace the static membership card on `/my` with current membership status and links to checkout. Preserve the existing dashboard shell.

- [ ] **Step 5: Run Web tests and static checks**

```bash
npm run test --workspace @mirujima/web
npm run typecheck --workspace @mirujima/web
npm run lint --workspace @mirujima/web
npm run build --workspace @mirujima/web
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit Web checkout**

```bash
git add apps/web/features/membership apps/web/app/membership apps/web/app/my/page.tsx apps/web/app/globals.css apps/web/package.json apps/web/.env.example package-lock.json
git commit -m "feat: add toss test membership checkout"
```

### Task 4: Extension payment handoff and membership expiry

**Files:**
- Modify: `.env.example`
- Modify: `src/vite-env.d.ts`
- Modify: `src/features/membership/product-config.ts`
- Modify: `src/features/membership/types.ts`
- Modify: `src/features/membership/membership.test.ts`
- Modify: `src/features/membership/service.ts`
- Modify: `src/features/membership/MembershipCard.tsx`
- Modify: `src/shared/types/messages.ts`
- Modify: `src/background/message-handler.ts`

**Interfaces:**
- Consumes: Web `/membership/checkout` and server membership response period fields.
- Produces: `membershipService.openCheckout()` and `MembershipSnapshot.currentPeriodEndsAt`.

- [ ] **Step 1: Write failing normalization and checkout URL tests**

Assert `toss`/`toss_payment` are preserved, expired Premium snapshots normalize to inactive, and `membershipCheckoutUrl('https://mirujima.vercel.app')` returns the exact checkout URL without wildcard origins.

- [ ] **Step 2: Run the focused test to verify it fails**

```bash
npm test -- src/features/membership/membership.test.ts
```

Expected: FAIL on the missing Toss types and checkout helper.

- [ ] **Step 3: Replace deferred activation with Web handoff**

Remove `VITE_BILLING_INTEGRATION` from `.env.example`, Vite env typing, and `MEMBERSHIP_PRODUCT`. Add required `VITE_WEB_APP_ORIGIN` validation. Change billing types to `"toss"`, activation source to `"toss_payment"`, add nullable period fields, and set the free snapshot billing integration to `null`.

Replace `membershipService.activate()` with:

```ts
async openCheckout(): Promise<void> {
  await chrome.tabs.create({ url: `${MEMBERSHIP_PRODUCT.webAppOrigin}/membership/checkout` });
}
```

Rename the runtime message to `MEMBERSHIP_OPEN_CHECKOUT`. Update the card copy to `테스트 결제`, `1개월 단건`, `자동 갱신 없음`; remove `결제 연동 전`. The restore button remains the mechanism for reading the newly activated server state.

- [ ] **Step 4: Run Extension regression checks**

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit Extension handoff**

```bash
git add .env.example src/vite-env.d.ts src/features/membership/product-config.ts src/features/membership/types.ts src/features/membership/membership.test.ts src/features/membership/service.ts src/features/membership/MembershipCard.tsx src/shared/types/messages.ts src/background/message-handler.ts
git commit -m "feat: open premium checkout from extension"
```

### Task 5: Membership end-to-end verification

**Files:**
- Modify only if verification exposes a defect in Task 1-4 files.

**Interfaces:**
- Consumes: complete membership payment path.
- Produces: verified local build and copy-ready deployment inputs.

- [ ] **Step 1: Run the full automated suite**

```bash
npx supabase db reset
npx supabase test db
npm test -- supabase/functions/tests/toss.test.ts
npm test
npm run typecheck
npm run lint
npm run build
npm run test --workspace @mirujima/web
npm run typecheck --workspace @mirujima/web
npm run lint --workspace @mirujima/web
npm run build --workspace @mirujima/web
```

Expected: every command exits 0.

- [ ] **Step 2: Perform one manual Toss sandbox payment**

Start Web with `NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_...`, set Supabase `TOSS_SECRET_KEY=test_sk_...` from the same API individual key set and `TOSS_PAYMENT_MODE=test`, then verify: no real charge, order becomes confirmed, period ends one month later, entitlements share that expiry, refresh is idempotent, and Extension restore shows Premium.

- [ ] **Step 3: Verify the fail-closed cases manually**

Use a callback amount other than `12900`, a `live_` client key, and a `live_` server key separately. Expected: no membership activation and safe Korean error copy.

- [ ] **Step 4: Commit only verification fixes**

If files changed, stage only those exact files and use:

```bash
git commit -m "fix: harden toss membership verification"
```
