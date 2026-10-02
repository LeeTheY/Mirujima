# 결제 모드와 production 전환 절차

현재 요청은 테스트 API 유지 및 실제 배포 직전 준비다. 이 문서는 전환 순서이며 실제 활성화 명령을 자동 실행하지 않는다. 제품 문구는 API 모드에 의존하지 않는다. Toss가 직접 표시하는 결제창 표시는 앱에서 변조하지 않는다.

## 현재 유지할 설정

- Web: `NEXT_PUBLIC_TOSS_PAYMENT_MODE=test`(미설정 기본값도 test), `NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_*`.
- Supabase: `TOSS_PAYMENT_MODE=test`, `TOSS_SECRET_KEY=test_sk_*`, `MIRUJIMA_LIVE_PAYMENTS_ENABLED=false` 또는 미설정.
- 환불: `MIRUJIMA_REFUND_MODE=provider_test`는 아래 금융 rollout 및 제공자 실호출 검증 이후 설정한다. `sandbox`는 내부 기록만 반영하며 결제사 취소가 아니다. 최신 handler는 환불 모드를 미설정하면 차단한다.
- 현금화: UI 신청과 `cashout-request`가 차단되어 있다. Toss 키나 live 스위치로 현금화를 활성화할 수 없다. 계약된 payout 제공자와 별도 구현이 필요하다.

## 배포 후보 검증 순서

1. 유료 검증 환경은 만들지 않는다. 로컬 PostgreSQL 검증과 기존 Supabase의 표시된 전용 테스트 계정을 사용한다. 테스트 포인트·내부 정산 기록이 있는 DB를 운영 금융 잔액으로 재사용하지 않는다. 데이터를 임의 삭제하거나 원장을 수정하지 않는다.
2. 최신 전체 migration을 순서대로 적용한다. 2026-10-03 원격 적용된 `0003/0006/0007/0010/0011/0012/0017/0018` 및 `202610030001`의 대응 Web/Extension/Edge Function을 한 릴리스로 묶는다. `0017`은 기존 예약 데이터 수정 없이 service-only 환불 RPC 3개를 교체한다.
3. 함께 배포할 함수: `membership-create-order`, `membership-confirm-payment`, `wallet-create-topup-order`, `wallet-confirm-topup`, `wallet-refund-topup`, `cashout-request` 및 보류 집중/보상 변경에 대응하는 함수. 기존 production에 함수만 먼저 교체하지 않는다.
4. 테스트 키 세트의 실제 결제 인증 → 승인 → 잔액/멤버십 반영 → 새로고침/중복 callback → 부분 취소 → 동일 요청 재조회까지 수행한다. DB 원장 금액과 Toss 승인/취소 거래를 대조한다. 로컬 HTTP 모의 검사는 이 증거를 대신하지 않는다.
5. 실제 origin에서 Google OAuth와 결제 return URL을 확인한다. Preview에서 production return URL로 이동하는 상태는 통합 검증 통과가 아니다. Extension은 정확한 서비스 origin만 허용하며 wildcard를 추가하지 않는다.
6. 타입·lint·Web/Extension 빌드·공개 Secret 검사·SQL·실제 로그인 E2E를 실행한다. 테스트 중 세션 쿠키·payment key·Secret을 공개 보고서나 artifact에 포함하지 않는다.
7. VAPID/Push, Chrome 설치본 호환성, 원격 복원 및 `verify:release:evidence`의 기존 출시 게이트를 완료한다. 검증된 revision과 artifact를 확정한다.

## 운영 결제로 전환할 때

계약·환불정책·미성년자 사용 정책과 실제 제공자 검증을 완료한 뒤에만 수행한다.

1. 승인된 운영 DB와 미완료 주문/환불을 확인한다. 기존 test 주문은 test 환경에서 조회·정리한다. 모드가 다른 영수증으로 정산하지 않는다.
2. 동일 MID의 개별 연동 키 세트를 준비한다. 서버 `TOSS_PAYMENT_MODE=live`, `TOSS_SECRET_KEY=live_sk_*`, `MIRUJIMA_REFUND_MODE=provider_live`로 설정하되 `MIRUJIMA_LIVE_PAYMENTS_ENABLED=false`를 유지한다.
3. Web `NEXT_PUBLIC_TOSS_PAYMENT_MODE=live`, `NEXT_PUBLIC_TOSS_CLIENT_KEY=live_ck_*` 및 HTTPS 실제 origin을 설정하여 **다시 빌드**한다. NEXT_PUBLIC 값은 기존 artifact의 키 변경으로 교체되지 않는다.
4. 대응 서버 함수/DB와 Web artifact를 맞추고 승인된 시점에 서버 `MIRUJIMA_LIVE_PAYMENTS_ENABLED=true`를 설정한다. 준비 전 요청은 안전하게 차단된다. 클라이언트 스위치만으로 서버 결제를 허용할 수 없다.
5. 승인된 실거래 최소 검증과 취소를 확인하고 원장·제공자 기록·오류율을 대조한다. 실제 검증 범위와 시간, revision을 증거로 남긴다.

## 장애 시

서버 live 스위치를 false로 내려 신규 결제 요청을 차단한다. 기존 결과가 불명확한 승인/환불은 예약 상태와 원래 멱등 키를 보존한다. 활성 결제 키를 test로 바꾸면 live 결제 조회가 불가능하므로 즉시 test 키로 덮어쓰지 않는다. 예약 해제나 새로운 취소 POST로 우회하지 말고 원래 제공자 거래를 조회해 대조한다. DB 파괴적 rollback을 실행하지 않는다.

현재는 위 운영 전환을 실행하지 않았다. Vercel CLI는 사용자 요청에 따라 로그아웃되어 있으며 다시 로그인하지 않는다.

공식 근거: [API 키 세트](https://docs.tosspayments.com/reference/using-api/api-keys), [결제창 연동](https://docs.tosspayments.com/guides/v2/payment-window/integration).
