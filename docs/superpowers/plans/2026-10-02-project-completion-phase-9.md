# 9차 개발: 결제 승인 복구·충전 주문 생명주기

승인된 W10 중 승인 결과 불명 상태와 충전 주문의 멱등 키 관리를 구현했다. 실제 Toss 인증/승인·부분 취소·환불 여정과 W10 전체 완료는 별개다.

## 구현

- 최초 승인 claim은 같은 주문 멱등 키로 승인한다. 재시도는 결제사 조회를 먼저 수행한다. 주문·payment key·금액·통화를 대조한 `DONE`만 원장 반영을 재시도하며 재승인하지 않는다. 인증 완료 `IN_PROGRESS`는 동일 키로 승인할 수 있다.
- 승인 API의 400 오류만으로 실패를 확정하지 않는다. 응답 유실·이미 처리 중·조회 실패는 확인 필요 상태로 유지한다. 결제사에서 확인한 `ABORTED`·`EXPIRED`만 실패로 기록한다. 취소된 결제·금액 불일치는 승인하거나 충전하지 않는다.
- 과거 실패 처리된 충전 주문에 결제 키가 남아 있으면 조회 전용 복구만 허용한다. 이미 원장에 반영된 충전은 늦은 실패 응답으로 덮어쓰지 않는다. 과거 실패한 멤버십 주문의 자동 복원은 이번 범위에서 제외한다.
- Web은 주문 생성 전 본인 사용자 ID·금액·주문 멱등 키를 sessionStorage에 저장한다. 응답 유실·새로고침 후에도 같은 키를 사용하며 결과 확인 전 금액을 잠근다. payment key·토큰·secret은 저장하지 않는다. 저장 실패나 손상은 새 주문을 만들기 전에 중단한다.
- 서버가 확인한 승인 완료·종료된 주문만 저장된 시도를 해제한다. SDK의 명시적 결제창 취소도 본인 주문이 승인 전 pending 상태임을 RPC로 확인한 뒤 해제한다. 처리 중인 주문은 서버에 저장된 키·금액으로 결과를 대조하며 결제창을 다시 열지 않는다.
- 신규 `202610020010_payment_confirmation_recovery.sql`은 기존 테이블을 사용한다. 본인 주문 취소 RPC는 posted 원장을 생성하지 않는다. 서비스 전용 claim·원장 확정 권한과 기존 잔액 산식을 유지한다. 오래된 실패 요청에 연결된 확정 결과가 있으면 거래 화면도 그 결과를 우선 표시한다.

## 검증

- `npm test`: 75개 파일, 381개 테스트 통과. 공유 provider 복구 19개, 실제 충전 Edge handler를 호출하는 mock 경계 5개, 주문 시도 7개 및 표시 회귀를 포함한다.
- 로컬 PostgreSQL + pgTAP: 28개 파일, 541개 단언 통과. 신규 파일 28개는 첫/반복 claim, legacy 조회 전용 복구, 단일 충전, 늦은 실패 차단, 주문 취소·소유권·grant·잔액 불변, 멤버십 key 검증을 확인한다. 전체 Supabase Auth stack이나 실제 Toss 호출 성공을 의미하지 않는다.
- root lint·typecheck·공개 비밀 패턴 검사, Web lint·production build 통과.
- Web E2E 23개 통과, 실제 로그인 상태가 필요한 3개 제외. 릴리스 인증 여정 통과로 처리하지 않는다.
- 실제 React TopupPanel + RPC/SDK fixture, Chromium: 중복 클릭 단일 실행, 응답 유실 후 같은 키 재사용, 금액 잠금, 서버 확인 취소, 새 금액·새 키, 처리 중 주문의 조회 복구와 SDK 재호출 방지, 민감 값 미저장, 390px 가로 넘침 없음·page error 없음. 캡처 두 장을 직접 확인했다. 전체 frontend-harness 평가나 실제 결제사 연동 검증과 구분한다.

## 배포·호환성과 다음 단계

이번 변경은 로컬이며 0010과 변경된 승인 Edge Function을 원격 적용하지 않았다. Web도 배포하지 않았다. 새 Web은 주문의 canonical `status`를 필수로 검증하므로 0010 없이 배포하지 않는다. SQL의 조회 전용 복구 플래그를 구버전 승인 handler가 무시할 수 있어 SQL·공유 helper·충전/멤버십 승인 handler·Web을 함께 검증하고 rollout해야 한다. Vercel 프로젝트 연결/인증과 실제 테스트 계정은 없다. 커밋·push·PR을 수행하지 않았다.

다음은 sandbox 환불과 실제 provider 취소 경로 분리, 원 결제 잔여 취소액·가용 잔액 경합, 취소 응답 유실의 대조 복구다. 멤버십 주문의 클라이언트 키 생명주기·만료/취소 entitlement·실제 테스트 결제·live 계약 gate도 남는다. 자동 현금화·Billing·live 결제로 전환하지 않았다.

공식 근거: [Toss API·상태·조회](https://docs.tosspayments.com/reference), [오류 코드](https://docs.tosspayments.com/reference/error-codes), [멱등성](https://docs.tosspayments.com/blog/what-is-idempotency).

화면 증거: `/Users/ldy/.codex/visualizations/2026/10/02/01a0fb93-cf0c-7ca3-bd07-7700d1ce9f00/development-phase-9/`.
