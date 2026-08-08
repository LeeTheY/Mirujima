# Toss 테스트 Premium 결제와 현금화 샌드박스 설계

## 1. 목표

Mirujima에 다음 두 흐름을 추가한다.

1. Toss Payments SDK v2와 테스트 API 키를 사용하는 Premium 1개월 단건 결제
2. 실제 계좌 송금 없이 `earned` 포인트의 현금화 수명주기를 재현하는 내부 샌드박스

기존의 무료 `deferred` Premium 활성화는 제거한다. 이 단계에서는 자동 정기결제, 실결제 키, Toss 지급대행, 실제 계좌정보 수집을 지원하지 않는다.

## 2. 결정 사항

### 2.1 결제 화면의 위치

Toss 결제는 Next.js Web의 `/membership/checkout`에서만 실행한다. Chrome Extension의 Premium CTA는 웹 결제 페이지를 새 탭으로 열고, 복귀 후 서버의 멤버십 상태를 다시 조회한다.

이유:

- Toss 결제 요청은 `successUrl`과 `failUrl` 리다이렉트를 사용한다.
- Extension 서비스 워커나 팝업 수명주기에 결제를 결합하지 않는다.
- 공개 client key와 서버 secret의 경계를 명확히 유지한다.

### 2.2 Premium 상품

- 상품: Premium 1개월 이용권
- 기본 가격: `12,900 KRW`
- 결제 방식: 일반 단건 결제
- 활성 기간: 승인 시각부터 `1 month`
- 자동 갱신: 없음
- 기존 활성 기간 중 재구매: 현재 만료 시각과 승인 시각 중 늦은 시각부터 1개월 연장

표시 문자열은 `VITE_PREMIUM_MONTHLY_PRICE_LABEL`로 관리하지만, 승인 금액의 source of truth는 서버 상수 `12900`이다. 클라이언트가 전달한 금액으로 주문 또는 멤버십을 확정하지 않는다.

### 2.3 테스트 모드 강제

서버는 다음 조건을 모두 만족할 때만 Toss 호출을 허용한다.

- `TOSS_PAYMENT_MODE=test`
- `TOSS_SECRET_KEY`가 `test_`로 시작

Web도 `NEXT_PUBLIC_TOSS_CLIENT_KEY`가 `test_`로 시작하지 않으면 결제 UI를 비활성화한다. 클라이언트 검사는 UX 보호이고, 최종 강제는 Edge Function에서 수행한다.

테스트 모드에서는 실제 결제수단에서 금액이 출금되지 않는다. UI 전체에 `테스트 결제 · 실제 청구 없음`을 표시한다.

## 3. 아키텍처

```text
Extension Premium CTA
  -> Web /membership/checkout
  -> membership-create-order Edge Function
  -> membership_payment_orders(pending)
  -> Toss SDK v2 requestPayment
  -> /membership/success?paymentKey&orderId&amount
  -> membership-confirm-payment Edge Function
  -> stored order amount 검증
  -> Toss POST /v1/payments/confirm
  -> SQL transaction으로 order confirmed + membership/entitlements 1개월 활성화
  -> Web 성공 UI
  -> Extension restore/get-membership-entitlements
```

현금화 흐름:

```text
earned available
  -> cashout-request Edge Function
  -> SQL transaction으로 earned -> cashout_reserved
  -> wallet_transactions(cashout_requested)
  -> 테스트 처리 UI
  -> cashout-complete-test Edge Function
  -> wallet_transactions(cashout_completed)
  -> cashout_reserved -> external(test)
```

실패 시 `cashout_rejected` transaction으로 예약액을 `earned`에 반환한다. 같은 요청은 동일한 idempotency key로 한 번만 반영한다.

## 4. 데이터 모델

### 4.1 기존 `memberships` 확장

다음 column을 additive하게 추가한다.

```text
current_period_started_at timestamptz
current_period_ends_at timestamptz
provider_customer_key text
provider_subscription_ref text
```

constraint를 확장한다.

```text
billing_integration: toss
activation_source: toss_payment
status: active | inactive
```

`provider_subscription_ref`에는 자동결제 식별자가 아니라 현재 단건 결제의 provider order reference를 저장한다. 기존 column 이름을 additive하게 재사용하기 위한 선택이다.

### 4.2 신규 `membership_payment_orders`

멤버십 주문은 포인트 원장과 의미가 다르고 `0P transaction`을 만들 수 없으므로 별도 테이블로 관리한다.

```text
id uuid primary key
user_id uuid not null
order_id text not null unique
payment_key text unique
amount_krw bigint not null check (amount_krw = 12900)
status text not null
idempotency_key text not null unique
provider text not null default 'toss'
provider_payload jsonb not null default '{}'
failure_code text
created_at timestamptz not null
confirmed_at timestamptz
updated_at timestamptz not null
```

상태는 `pending | confirming | confirmed | failed | expired`로 제한한다. 사용자는 자기 주문을 조회만 할 수 있고 insert/update/delete는 서버 전용이다.

### 4.3 신규 `wallet_transactions`

포인트는 mutable balance column이 아니라 posted transaction의 합으로 계산한다.

```text
id uuid primary key
kind text not null
status text not null
from_user_id uuid
to_user_id uuid
from_bucket text
to_bucket text
points bigint not null check (points > 0)
krw_amount bigint
related_transaction_id uuid
idempotency_key text not null unique
metadata jsonb not null default '{}'
created_at timestamptz not null
updated_at timestamptz not null
```

이번 범위에서 사용하는 kind:

```text
cashout_requested
cashout_completed
cashout_rejected
```

bucket은 `earned | cashout_reserved | external`을 사용한다. `cashout_reserved`는 중복 현금화를 막기 위한 내부 예약 bucket이며, 외부 공개 공통 타입에는 노출하지 않는다.

클라이언트에는 insert/update/delete 권한을 주지 않는다. 본인이 당사자인 row의 안전한 column만 조회한다.

### 4.4 현금화 가능 잔액

```text
cashoutAvailable = posted inbound to earned - posted outbound from earned
```

- `topup`과 `reserved`는 계산에 포함하지 않는다.
- 0 또는 음수 신청을 거부한다.
- integer만 허용한다.
- 신청 금액이 available보다 크면 거부한다.
- 이번 작업은 earned 포인트를 새로 발행하지 않는다. 기존 또는 이후 집중 정산이 적립한 earned transaction만 현금화한다.
- 로컬/통합 테스트는 fixture transaction을 서버 역할로 삽입해 흐름을 검증한다.

## 5. 서버 경계

### 5.1 Edge Functions

```text
membership-create-order
membership-confirm-payment
cashout-request
cashout-complete-test (outcome: completed | rejected)
```

모든 Edge Function은 Supabase access token으로 사용자를 확인한다. 금융 RPC는 authenticated에 공개하지 않고 service role만 실행하며, Edge Function이 검증한 사용자 UUID를 명시적으로 전달한다. client body의 `userId`, 가격, bucket, from/to user는 신뢰하지 않는다.

### 5.2 SQL RPC

```text
create_membership_payment_order()
confirm_toss_membership_payment()
request_test_cashout()
complete_test_cashout()
reject_test_cashout()
```

복수 write는 RPC transaction 안에서 실행한다. 주문 및 현금화 idempotency key별 advisory lock을 사용한다.

결제 확인 순서:

1. 인증 사용자와 pending order 소유권 확인
2. DB 저장 금액과 callback amount 비교
3. order를 `confirming`으로 전환
4. Toss 승인 API 호출
5. Toss 응답의 `orderId`, `paymentKey`, `totalAmount`, `status` 재검증
6. SQL transaction으로 주문 확정
7. 멤버십 기간 연장
8. 모든 Premium entitlement에 동일한 `valid_until` 적용

`confirming` 상태가 일정 시간 이상 유지된 재시도는 Toss 결제 조회 API로 승인 여부를 먼저 확인한다. Toss 호출 후 DB 확정이 실패한 경우에도 같은 idempotency key와 조회 결과로 복구하며, 승인 API를 새 키로 중복 호출하지 않는다.

### 5.3 기존 deferred 경로 제거

- `VITE_BILLING_INTEGRATION` 환경변수 제거
- `activate-membership`의 deferred 활성화 동작 제거
- Extension의 `MEMBERSHIP_ACTIVATE` 메시지 제거 또는 결제 페이지 열기 동작으로 교체
- `activate_deferred_membership()`은 새 migration에서 execute 권한을 제거하고 함수 삭제
- 기존 deferred 활성 사용자 데이터는 즉시 삭제하지 않는다. 새 결제 없이 무기한 entitlement가 유지되지 않도록 별도 migration에서 `inactive` 처리하고 entitlement를 비활성화한다.
- 타입의 `deferred | stripe`는 `toss` 중심으로 변경하며 과거 서버 응답은 안전하게 free/inactive로 정규화한다.

## 6. Web 및 Extension UX

### 6.1 Web

경로:

```text
/membership/checkout
/membership/success
/membership/fail
/wallet/cashout
```

결제 화면:

- Premium 1개월, 12,900원
- 자동 갱신 아님
- 테스트 결제 및 실제 청구 없음
- 주문 생성 후에만 Toss SDK 실행
- 공식 `@tosspayments/tosspayments-sdk` v2 사용
- 중복 클릭 방지
- 실패 시 주문/멤버십이 안전하다는 안내와 재시도 CTA

현금화 화면:

- 현금화 가능 earned 잔액
- 신청 포인트
- `테스트 현금화 · 실제 입금 없음`
- 요청/처리/완료/실패 상태
- 계좌번호 입력 없음
- 완료/실패 버튼은 샌드박스 처리 재현용이며 서버가 test mode일 때만 노출

### 6.2 Extension

- Premium CTA는 `${VITE_WEB_APP_ORIGIN}/membership/checkout`을 연다.
- 결제 후 사용자가 Extension으로 돌아오면 `get-membership-entitlements`를 호출해 상태를 복구한다.
- 활성 카드에는 실제 기간 종료 시각과 `자동 갱신 없음`을 표시한다.
- `결제 연동 전` 배지를 제거한다.

## 7. 환경변수와 Secret

Extension `.env`:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_PREMIUM_MONTHLY_PRICE_LABEL=월 12,900원
VITE_WEB_APP_ORIGIN=http://localhost:3000
```

Web `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_...
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
```

Supabase Secrets:

```text
TOSS_SECRET_KEY=test_sk_...
TOSS_PAYMENT_MODE=test
```

기존 Supabase 서버 인증용 key와 `MIRUJIMA_SERVER_SIGNING_SECRET`은 그대로 유지한다. `VITE_PREMIUM_MONTHLY_PRICE_LABEL`은 공개 표시값이므로 secret이 아니다.

## 8. 오류 및 보안 처리

- raw Toss/Supabase 오류, payment key, server secret을 UI에 노출하지 않는다.
- callback query만으로 멤버십을 활성화하지 않는다.
- 결제 승인 전 entitlement를 부여하지 않는다.
- 결제 금액은 서버 저장 주문과 Toss 응답을 모두 비교한다.
- payment/order id와 cashout idempotency key에 unique constraint를 둔다.
- financial row의 client mutation을 차단한다.
- 현금화 완료는 server test mode에서만 허용한다.
- 테스트 모드가 아닌 키를 감지하면 fail closed한다.
- Toss 일반결제 webhook은 신뢰해 바로 확정하지 않고 필요 시 결제 조회 API로 검증한다.

## 9. 테스트 전략

### 9.1 SQL

- 결제 주문 및 wallet RLS
- 클라이언트 financial mutation 거부
- 주문 금액/상태 constraint
- 동일 order/idempotency 중복 방지
- Premium 기간 최초 활성화 및 재구매 연장
- entitlement `valid_until` 동기화
- earned 초과 현금화 거부
- 동시 현금화 요청 race 방지
- 완료/실패 멱등성

### 9.2 Edge Function

- 인증 누락
- live key 또는 mode 거부
- callback 금액 변조
- 다른 사용자 order 접근
- Toss 승인 성공/실패/timeout
- 승인 성공 후 DB 재시도 복구
- test cashout 완료의 production 차단

Toss HTTP 호출은 unit test에서 mock하고, 수동 통합 테스트에서만 실제 Toss 테스트 API를 호출한다.

### 9.3 Web/Extension

- checkout route 인증 가드
- 테스트 표시와 자동 갱신 아님 문구
- 중복 결제 버튼 차단
- success/fail route 상태
- cashout form validation
- Extension CTA URL
- 결제 후 entitlement restore
- root와 web의 typecheck/lint/test/build

## 10. 배포 순서

1. DB migration 적용
2. Supabase test secrets 설정
3. Edge Functions 배포
4. Vercel public test env 설정 및 Web 배포
5. Extension public env 설정 및 build
6. Toss 테스트 결제 승인 수동 확인
7. 현금화 요청/완료/실패 수동 확인

실결제로 전환하는 작업은 이 설계와 분리한다. 라이브 전환에는 Toss 계약, 환불 정책, 미성년자 사용 및 earned point 지급의 법률·회계 검토, 지급대행 계약을 별도의 출시 gate로 둔다.
