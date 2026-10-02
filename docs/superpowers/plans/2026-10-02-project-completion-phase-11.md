# 11차 개발: 멤버십 주문 복구·기간·상속 권한

W10의 멤버십 주문 생명주기와 권한 검증을 로컬 구현했다. 30일 단건 상품·기존 가격·좌석 일할 계산을 유지하며 자동 Billing, 승인된 이용권의 provider 환불·해지를 새로 구현한 것은 아니다.

## 1. 구현 기능

주문 생성 전에 본인 ID·주문 종류·멱등 키를 sessionStorage에 저장한다. 서버 주문 ID·견적 금액을 받으면 같은 시도에 저장하고 재조회 시 대조한다. 새로고침과 모달 재진입에서도 같은 키를 사용한다. 다른 주문 종류 화면에서는 새 요청을 막고 기존 주문으로 돌아가는 링크를 제공한다. payment key·토큰·secret은 저장하지 않는다. 손상된 storage·저장 실패에는 요청 전에 중단한다.

처리 중·확인 필요 주문은 결제창을 다시 열지 않고 본인 서버 주문의 key·amount로 승인 결과를 조회한다. `paymentOrder` 영수증을 현재 멤버십 상태와 별도로 반환한다. 과거 주문이 승인됐더라도 이용 기간이 끝났으면 다시 활성화하지 않는다. 완료·종료 주문과 서버가 확인한 승인 전 취소에서만 새 시도를 허용한다. SDK 오류 원문을 화면에 노출하지 않으며 같은 키를 확인하도록 안내한다.

SDK의 명시적 결제창 취소는 인증된 본인의 pending·미claim 주문만 종료한다. claim·취소가 같은 lock을 사용한다. 이미 승인된 이용권이나 활성 가족 멤버십·좌석을 취소하거나 환불하지 않는다.

학생의 가족 상속은 보호자의 해당 entitlement 행이 enabled이고 유효하며 가족 멤버십도 활성인 경우만 허용한다. `get_effective_membership` 목록과 AI 서버의 `has_effective_membership_entitlement` 조건을 맞췄다. 보호자용 AI 요약은 상속하지 않는다. 주간 리포트·기존 기능 목록은 유지한다. Web의 active 기간이 누락·손상되면 확인 필요 상태이며, 만료 시 무료로 표시한다. Extension의 기능 판정은 호출 시마다 종료 시각을 확인해 화면을 열어둔 뒤 기간이 끝나도 접근을 허용하지 않는다.

## 2. 변경 파일

- Web: `features/membership/checkout-attempt.ts`, `checkout.tsx`, `membership-status.ts`, `app/membership/success/page.tsx`, `app/globals.css`와 회귀 테스트.
- 서버: `membership-confirm-payment/index.ts`와 실제 handler mock 테스트.
- Extension: `src/features/membership/types.ts`, `membership.test.ts`.
- SQL·검증 문서: 신규 0012, `membership_order_lifecycle.test.sql`, 기존 AI fixture와 roadmap/release checklist.

## 3. DB migration

`202610020012_membership_order_entitlement_boundary.sql`은 기존 memberships·membership_entitlements·membership_payment_orders·family_links만 사용한다. 새 테이블/컬럼·금융 원장 변경은 없다. creator는 same-key 주문 종류 변경을 거부하고, key가 남은 불명 실패는 `needs_review`로 반환한다. legacy 실패 주문을 자동 재승인하지 않는다.

## 4. 기존 동작 영향

가격·30일 기간·가족 추가 좌석의 기존 확정 함수를 유지한다. 중복 승인으로 기간을 연장하지 않는다. 새로운 `paymentOrder` 응답은 additive지만 Web이 이를 검증하므로 새 승인 handler와 함께 rollout해야 한다. 가족 entitlement 행이 없으면 기능이 허용되지 않는다. 실제 승인 함수는 entitlement를 생성하며, 기존 AI fixture에도 같은 행을 추가했다. 최초 회귀에서 빠진 주간 리포트를 검출하고 기존 기능을 복구했으며 실패 검사를 삭제하지 않았다.

## 5. 보안·권한

reconcile은 인증된 user ID로 원 주문을 조회하고 클라이언트 금액·key를 무시한다. 승인·활성화 RPC는 service-only다. `cancel_pending_membership_order`는 authenticated 본인만 실행하고 anon은 차단한다. 승인된 주문·키가 바인딩된 주문의 취소는 거부한다. 비활성·만료·연결 해제·disabled/expired entitlement는 서버 AI 사용을 차단한다. 본인 외 멤버십 조회 권한을 추가하지 않았다.

## 6. 검증

- `npm test`: 80개 파일 / 434개 통과. 주문 시도·견적/종류/영수증·기간 판정 회귀와 실제 승인 handler mock 5개 포함. provider 성공 뒤 DB 실패를 GET으로 복구하고 본인 조회·좌석 활성화 함수 분기를 확인했다.
- 로컬 PostgreSQL + pgTAP: 30개 파일 / 603개 단언 통과. 신규 31개는 본인 취소·claim 이후 취소 금지·중복 기간 불변·만료 경계·가족 entitlement 철회·연결 해제·주간 리포트·legacy 확인 필요를 검증한다.
- 독립 PostgreSQL 연결 경합 3개 통과: 취소→claim, claim→취소, 중복 승인. 후속 연결은 lock을 기다렸으며 활성 멤버십 1개, 기간 2,592,000초(30일)를 대조했다. 임시 DB는 삭제했다.
- 실제 React MembershipCheckout + RPC/SDK fixture, Chromium: 중복 클릭 단일 요청, 응답 유실·새로고침 동일 키, 서버 확인 취소 이후 새 키, 처리 중 주문의 SDK 재호출 방지, 만료 상태와 승인 영수증 분리, 추가 좌석 종류·금액 보존, 민감값 미저장, 390px 가로 넘침·page error 없음. 최종 캡처를 확인했다. 전체 frontend-harness 평가나 실제 Toss 성공을 의미하지 않는다.
- Web E2E 23개 통과, 실제 로그인 상태가 필요한 3개 제외. 실제 학생·보호자 로그인/결제/AI 여정은 미검증이다.
- 실제 Chromium MV3 smoke 9개 통과: 로그인 경계·외부 origin·DNR·재시작·pause/finish·offline break 복구. 이 smoke 자체가 실제 유료 계정의 entitlement 철회를 검증한 것은 아니다.
- root lint·typecheck, Web lint, 공개 비밀 패턴 검사·diff 공백 검사 통과.

## 7. build

Web production build, Extension production 및 development build 통과. Next·React·Chrome Manifest 버전과 저장소 구조는 변경하지 않았다.

## 8. 원격 배포·남은 gate

0012·승인 handler·Web·Extension은 로컬 검증이며 이번 원격 배포·커밋·push·PR은 없다. 0010~0012와 관련 승인/환불 계약의 동시 rollout을 검증해야 한다. 실제 테스트 계정과 Vercel 연결/인증이 없어 실제 provider·로그인 검증은 미완료다.

승인된 멤버십의 provider 취소·환불과 entitlement 철회를 연결하는 운영 경로, stale 좌석 주문이 이미 승인된 경우 대조·환불, legacy failed membership 복구 도구, cross-browser 미결 주문 조회는 남아 있다. 현재 같은 키를 보존하거나 확인 필요 상태로 두며 새 결제로 무조건 우회하지 않는다. 계약 없는 자동 Billing·현금화·live 전환은 계속 비활성이다. W10 전체를 완료 처리하지 않는다. 다음은 W11 공통 로딩/오류/접근성·반응형 검증이며 금융 실통합 gate는 별도로 유지한다.

공식 근거: [Toss SDK 오류 코드](https://docs.tosspayments.com/sdk/v2/error-codes), [Core API](https://docs.tosspayments.com/reference).

증거: `/Users/ldy/.codex/visualizations/2026/10/02/01a0fb93-cf0c-7ca3-bd07-7700d1ce9f00/development-phase-11/`.
