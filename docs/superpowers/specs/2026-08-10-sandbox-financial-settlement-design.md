# 샌드박스 결제·환불·환급 DB 정산 설계

## 목표

Toss Payments 테스트 모드의 화면과 사용 감성은 유지하되 실제 결제사 승인, 취소 또는 계좌 송금 없이도 사용자의 명시적인 테스트 액션이 서버에서 검증되어 DB에 확정 기록되도록 한다.

## 범위

- 멤버십 1개월 테스트 가입
- 학생·보호자 포인트 테스트 충전
- 보호자 미사용 충전 포인트 테스트 환불
- 학생 획득 포인트 테스트 환급

실제 운영 결제와 자동 정기결제는 이번 범위에 포함하지 않는다.

## 권한 경계

- 브라우저는 금액, 사용자 ID, 원장 상태를 직접 확정하지 않는다.
- Edge Function은 JWT로 사용자를 인증하고 입력을 검증한다.
- 금융 변경은 `service_role`만 실행 가능한 `security definer` RPC에서 트랜잭션으로 처리한다.
- `wallet_transactions`에 대한 authenticated 사용자의 insert/update/delete 권한은 추가하지 않는다.
- 모든 샌드박스 확정 데이터에는 `sandbox: true`와 실제 외부 처리가 없었음을 나타내는 metadata를 남긴다.

## 처리 흐름

### 멤버십

1. 기존 멤버십 주문을 멱등 키로 생성한다.
2. 샌드박스 완료 Edge Function이 주문 소유권과 금액을 검증한다.
3. 가상 payment key로 주문을 claim한다.
4. `membership_payment_orders.status`를 `confirmed`로 바꾸고 provider payload에 `actualPayment: false`를 기록한다.
5. `memberships`와 `membership_entitlements`를 1개월 활성화한다.

### 포인트 충전

1. 기존 충전 주문을 멱등 키로 생성하여 `topup_requested`를 기록한다.
2. 샌드박스 완료 Edge Function이 주문 소유권과 금액을 검증한다.
3. 가상 payment key로 `topup_confirmed` posted 원장을 추가한다.
4. `topupAvailable` 잔액을 새 원장 합계로 반환한다.

### 충전 포인트 환불

1. 최근 환불 가능한 `topup_confirmed` 건을 잠그고 `topup_refund_requested`로 예약한다.
2. Toss 취소 API는 호출하지 않는다.
3. 동일 서버 요청에서 `topup_refunded` posted 원장을 기록한다.
4. provider payload에 `status: CANCELED`, `sandbox: true`, `actualRefund: false`를 남긴다.

### 획득 포인트 환급

1. 가용 earned 잔액을 잠그고 `cashout_requested`로 예약한다.
2. 실제 송금은 호출하지 않는다.
3. 동일 서버 요청에서 `cashout_completed` posted 원장을 기록한다.
4. metadata에 `sandbox: true`, `actualTransfer: false`를 남긴다.

## UI

- Toss 테스트 결제 카드, 결제 용어와 시각 스타일은 유지한다.
- 버튼은 테스트 결제/충전임을 명확히 표시한다.
- 성공 후 현재 화면에서 완료 상태와 DB 기반 잔액 또는 멤버십 상태를 즉시 갱신한다.
- 실패 시 클라이언트에서 성공 숫자를 임시로 만들지 않는다.

## 멱등성과 오류 처리

- 주문, 확정, 환불, 환급은 기존 idempotency key와 advisory lock을 사용한다.
- 같은 버튼을 여러 번 눌러도 같은 주문 또는 정산 결과를 반환한다.
- 서버 확정 전에는 성공 메시지를 표시하지 않는다.
- 부분 완료가 발생하면 원장 row와 상태를 남겨 재호출로 수렴시킨다.

## 검증

- RPC 단위 DB 테스트: 최초 처리, 중복 처리, 소유권, 잔액 부족, 원장 metadata
- Edge 입력 테스트: 잘못된 금액과 멱등 키 거부
- 웹 단위 테스트: 샌드박스 응답 파싱과 성공 상태
- TypeScript 검사, 전체 관련 Vitest, 원격 DB lint
- 원격 마이그레이션과 Edge Function 배포 후 migration/function 목록 확인
