# Toss 테스트 포인트 충전 및 현금화 안정화 설계

## 목표

Mirujima 웹에 실제 청구가 발생하지 않는 Toss Payments 테스트 포인트 충전을 추가하고, 현금화 샌드박스가 earned 포인트만 안정적으로 예약·완료·반환하도록 수정한다.

## 확정 범위

- 충전 금액은 `10,000P`, `30,000P`, `50,000P`, `100,000P`, `150,000P` 다섯 개 버튼으로만 선택한다.
- 사용자 임의 금액 입력은 제공하지 않는다.
- `1P = 1 KRW`로 서버에서 검증한다.
- Toss API 개별 연동 테스트 키(`test_ck_`, `test_sk_`)만 허용한다.
- 결제는 실제 청구가 없는 Toss 테스트 모드로만 동작한다.
- 승인된 충전 포인트는 `topup` bucket에만 반영하고 현금화할 수 없다.
- 현금화는 집중 성공 등 서버 원장에서 생성된 `earned` 포인트만 허용한다.
- 현금화 완료·거절은 실제 계좌 송금 없이 상태와 원장만 재현한다.

## 선택한 접근

포인트 충전을 Premium 결제와 분리된 지갑 도메인으로 구현한다. Premium 주문 테이블과 RPC를 억지로 재사용하지 않고, 기존 `wallet_transactions` 원장과 포인트 전용 주문·승인 RPC를 사용한다. Toss SDK와 공통 서버 Toss API 경계는 재사용하되 상품 검증과 원장 반영은 지갑 전용으로 유지한다.

UI만으로 포인트를 지급하는 방식은 서버 검증과 Toss 연동 요구를 위반하므로 사용하지 않는다. Premium 주문 흐름을 포인트 충전과 공용화하는 방식은 멤버십 기간과 지갑 회계를 결합하므로 사용하지 않는다.

## 사용자 흐름

### 포인트 충전

1. 사용자가 `/wallet/charge`에서 다섯 금액 중 하나를 선택한다.
2. 웹이 `wallet-create-topup-order`를 호출한다.
3. 서버가 인증 사용자, 허용 금액, 멱등 키를 검증하고 고유 `orderId`를 만든다.
4. 웹이 Toss SDK의 카드 테스트 결제창을 연다.
5. Toss가 `/wallet/charge/success`로 `paymentKey`, `orderId`, `amount`를 전달한다.
6. 웹이 `wallet-confirm-topup`을 호출한다.
7. 서버가 저장된 주문 금액과 callback 금액을 비교하고 Toss 승인 API를 호출한다.
8. 승인 응답의 주문·금액·상태를 검증한 뒤 `topup_confirmed` posted 원장 행을 한 번만 기록한다.
9. 성공 화면에서 새 `topupAvailable` 잔액과 테스트 결제 안내를 표시한다.

### 현금화 샌드박스

1. `wallet-summary`가 `topupAvailable`, `earnedAvailable`, `cashoutReserved`, `cashoutCompleted`를 반환한다.
2. 사용자는 earned 잔액 안에서 현금화 포인트를 신청한다.
3. `cashout-request`는 테스트 모드, 인증, 입력, earned 잔액, 멱등 키를 검증한다.
4. 요청 성공 시 `earned → cashout_reserved` 원장을 기록한다.
5. 테스트 완료는 `cashout_reserved → external`, 테스트 거절은 `cashout_reserved → earned`로 기록한다.
6. 실제 지급 API, 계좌 정보, 송금은 사용하지 않는다.

## 데이터 및 서버 경계

기존 `wallet_transactions`를 계속 단일 재무 원장으로 사용한다. 결제 인증 전 주문은 잔액에 포함하지 않으며, 승인된 `topup_confirmed` posted 행만 `topupAvailable`에 합산한다.

포인트 주문은 다음을 서버에서 고정한다.

- 허용 금액 집합: `10000 | 30000 | 50000 | 100000 | 150000`
- `points = krw_amount`
- provider: `toss`
- 테스트 모드만 허용
- 고유 `provider_order_id`
- 고유 `idempotency_key`

승인 과정은 advisory lock 또는 주문 row lock으로 직렬화한다. callback 금액만 신뢰하지 않고 저장된 주문과 Toss 응답을 모두 비교한다. 중복 승인 요청은 기존 confirmed 결과를 반환하며 포인트를 다시 적립하지 않는다.

## 컴포넌트와 경로

- `/wallet/charge`: 충전 금액 버튼, 선택 상태, Toss 테스트 결제 CTA, 충전 내역
- `/wallet/charge/success`: 서버 승인 및 새 잔액 표시
- `/wallet/charge/fail`: Toss 실패 코드의 안전한 사용자 안내
- `wallet-create-topup-order`: 주문 생성 Edge Function
- `wallet-confirm-topup`: Toss 승인 및 원장 반영 Edge Function
- `wallet-summary`: 네 개 지갑 bucket 요약
- `cashout-request`, `cashout-complete-test`: 현금화 샌드박스

마이페이지의 “포인트 충전하기” 링크는 `/wallet/charge`로 수정하고 “환급 신청”만 `/wallet/cashout`을 유지한다.

## 현금화 오류 처리

현재 generic 오류가 발생하는 경계를 찾기 위해 Edge Function은 secret이나 토큰을 제외한 안전한 오류 코드와 요청 단계만 서버 로그에 남긴다. 클라이언트는 Functions 오류 응답의 JSON을 안정적으로 파싱하고 다음 코드를 구분한다.

- `authentication_required`
- `insufficient_earned_points`
- `invalid_cashout_points`
- `cashout_not_found`
- `cashout_already_settled`
- `test_mode_required`
- `wallet_service_unavailable`

현금화는 Toss 결제 승인 API를 호출하지 않으므로 `TOSS_SECRET_KEY`를 요구하지 않는다. `TOSS_PAYMENT_MODE=test`만 확인해 production 자동 지급을 차단한다. 실패 시 원장 잔액은 변경하지 않는다.

## 보안

- `NEXT_PUBLIC_TOSS_CLIENT_KEY`에는 `test_ck_`만 허용한다.
- `TOSS_SECRET_KEY`는 Supabase Secret의 `test_sk_`만 허용한다.
- 클라이언트가 사용자 ID, 원장 bucket, provider 금액을 지정하지 못하게 한다.
- Edge Function은 access token으로 사용자를 다시 확인한다.
- 원장 mutation RPC는 `service_role`만 실행한다.
- 결제 및 원장 오류 원문, 키, 토큰을 브라우저에 노출하지 않는다.
- 충전 포인트와 earned 포인트를 합치지 않는다.

## 테스트 및 검증

- 허용 금액 다섯 개와 그 외 금액 거절 단위 테스트
- 버튼 선택과 사용자 임의 입력 부재 UI 테스트
- 주문 금액 변조, 중복 주문, 중복 승인 SQL 테스트
- Toss 테스트 키 prefix와 승인 응답 검증 테스트
- `topup_confirmed`만 잔액에 포함되는 SQL 테스트
- 충전 포인트 현금화 거절과 earned 포인트 현금화 성공 SQL 테스트
- Edge Function 오류 코드 매핑 테스트
- 웹 테스트, 타입 검사, 린트, 프로덕션 빌드
- Supabase migration 배포, Edge Function 배포, 원격 배포 상태 확인
- 실제 Toss 테스트 카드 결제 1회와 현금화 완료·거절 각 1회 수동 검증

## 배포 조건

- Web: `NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_...`
- Supabase: `TOSS_PAYMENT_MODE=test`, `TOSS_SECRET_KEY=test_sk_...`
- 실제 청구와 실제 송금은 활성화하지 않는다.
