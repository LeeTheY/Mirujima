# 10차 개발: 부분 취소·환불 결과 복구

승인된 W10의 다음 단계다. 결제사를 호출하지 않는 sandbox와 Toss 카드 테스트 취소를 명시적으로 분리했다. 실제 로그인 계정·Toss 거래가 없어 provider 호출은 fixture 검증이며 원격 배포와 live 전환을 수행하지 않았다.

## 1. 구현한 기능

환불 금액을 원 결제의 남은 원장 배정액과 현재 topup 가용 잔액으로 제한한다. 환불 예약과 보호자 지원 예약은 동일한 사용자 lock 순서를 사용한다. 미정산 환불이 있으면 같은 키는 복구하고 새 키의 환불은 차단한다.

`MIRUJIMA_REFUND_MODE=sandbox|provider_test`를 반드시 명시한다. 미설정 시 예약 전에 중단한다. sandbox는 provider 호출 없이 기존 DB 원장 흐름을 유지한다. provider_test는 `TOSS_PAYMENT_MODE=test`와 `test_sk_*`만 허용하고, 카드 결제만 자동 처리한다. 가상계좌·다른 결제수단·부분 취소 불가·원 주문 대조 실패는 자동 취소하지 않는다.

provider 경로는 원 결제를 먼저 조회해 payment key·order ID·원금·KRW·남은 취소 가능액을 확인한다. 취소 전 잔액과 기존 취소 거래 키를 서버 metadata에 저장하고 호출 권한을 한 번만 부여한다. 취소 POST에는 정확한 `cancelAmount`, 환불 요청 ID로 만든 사유와 고정 멱등 키를 넣는다. 응답의 `CANCELED`/`PARTIALLY_CANCELED`뿐 아니라 해당 사유의 단일 취소 거래, `cancelStatus=DONE`, 금액·새 transaction key·예상 잔여 금액을 검증한다. 원문 결제 응답·계좌 정보는 저장하지 않는다.

호출 기록이 남은 요청의 재시도는 GET만 수행한다. timeout·결제사 오류·DB 실패로 취소 결과를 모르면 예약금을 유지하고 새 POST와 자동 예약 반환을 하지 않는다. 취소 완료 후 DB 반영만 실패한 경우 같은 요청으로 조회·단일 정산을 재시도할 수 있다. 취소 거래 키를 다른 환불에 재사용할 수 없다. 늦은 반려 요청은 이미 완료된 원장 결과를 반환한다.

Web은 요청 전에 본인 ID·금액·멱등 키를 sessionStorage에 저장한다. 새로고침·모달 재진입에서도 같은 요청을 확인하며 처리 중 금액을 잠근다. provider key·토큰·secret은 저장하지 않는다. sandbox 원장 반영과 결제사 테스트 취소를 구분하고 실제 계좌 입금 완료라고 표시하지 않는다. 결과 확인 중 잔액은 마지막 조회값임을 표시한다. 확정 결과 이후 잔액 조회 실패도 정산을 취소하지 않고 잔액 확인 UI로 연결한다.

## 2. 변경 파일

- `supabase/functions/_shared/refund-recovery.ts`, `toss.ts`: 조회·부분 취소·결과 검증.
- `supabase/functions/wallet-refund-topup/index.ts`: 모드 선택, 본인 서버 claim, dispatch·정산, 불명 결과 보존.
- `apps/web/features/wallet/refund-attempt.ts`, `refund-panel.tsx`, `refund-modal.tsx`, `app/globals.css`: 요청 보존·금액 잠금·결과 표시·모바일 제목.
- 관련 unit/handler/SQL 회귀, README·로드맵·release checklist.

## 3. DB migration

`202610020011_provider_refund_recovery.sql`은 기존 wallet_transactions와 request metadata를 확장한다. 새 테이블/컬럼, 잔액 산식 변경, posted 금액 수정은 없다. `prepare_topup_refund`는 service_role 전용이다. 기존 reserve/complete/reject 권한도 service-only다.

실제 `confirm_toss_topup_payment`는 주문 ID를 원 요청 행에 보관하고 posted 충전에는 null로 둔다. 환불은 related_transaction_id로 소유자·payment key·금액이 같은 원 요청을 찾아 canonical 주문 ID를 얻는다. 기존 posted 행을 수정하지 않는다. 실제 SQL 승인→충전→환불 준비 회귀도 추가했다.

## 4. 기존 기능 영향

기존 sandbox 금액별 환불과 보호자 지원을 유지한다. 신규 요청은 mode prepare가 필요하고 미정산 환불 중 다른 환불이 차단된다. 기존 pgTAP sandbox 시나리오도 새 prepare 계약을 추가했으며 기존 검증을 제거하지 않았다. 과거 환불 요청은 provider 자동 취소로 전환하지 않는다. 기존 명시적 sandbox 요청은 sandbox 결과만 허용한다.

## 5. 보안·권한

사용자가 보내는 user ID·payment key·원금·모드는 사용하지 않는다. 인증된 사용자와 서버 원장만 사용한다. 클라이언트는 dispatch·정산·반려 RPC를 직접 실행할 수 없다. provider 취소 호출 기록 이후 `reject_topup_refund`는 자동 반환을 거부한다. 누락된 JSON 필드가 SQL null 비교로 정산 검증을 우회하지 못하도록 검사했다.

## 6. 검증

- `npm test`: 78개 파일 / 419개 통과. 새 provider 복구·전액 취소 호환 24개·실제 Edge handler mock 6개·브라우저 요청 모델 8개 포함.
- 로컬 PostgreSQL + pgTAP: 최종 29개 파일 / 572개 단언 통과. 신규 31개는 본인·grant·한도·모드 고정·단일 dispatch·예약 보존·부분 취소·거래 키 재사용 차단·실제 승인 구조를 확인한다. 전체 Supabase Auth stack과 실제 Toss 거래가 아니다.
- 독립 PostgreSQL 두 연결 경합 4개 통과: 환불→보호자 승인, 승인→환불, 중복 dispatch, dispatch→반려. 두 번째 연결이 lock을 기다렸으며 최종 topup 5,000P·보호자 reserved 2,000P·환불 예약 3,000P를 대조했다. 임시 DB는 삭제했다.
- 실제 RefundPanel + RPC fixture, Chromium: 중복 클릭 단일 실행, 결과 불명 보존, 입력 잠금, 새로고침 후 동일 키·금액 복구, terminal 이후 새 키, sandbox/provider 구분, 민감 값 미저장, 390px 가로 넘침 없음·page error 없음. 캡처를 직접 확인했다. 실제 결제사 연동·전체 frontend-harness 평가와 구분한다.
- Web 공개/인증 경계 E2E 23개 통과, 실제 로그인 상태가 필요한 3개 제외. 릴리스 인증 검증으로 처리하지 않는다.
- root lint·typecheck, Web lint, public secret 검사·diff 공백 검사 통과.

## 7. build

Web production build 통과, 32개 route 유지. Chrome Extension 코드는 이번 단계에서 변경하지 않아 MV3 통합을 새로 검증했다고 주장하지 않는다.

## 8. 배포·남은 gate

0011·환불 helper/handler·Web은 로컬이며 원격 미적용이다. 0010과 함께 SQL·승인/환불 handler·Web의 계약을 대조하고 동시 rollout해야 한다. 구버전 refund handler는 unknown outcome에서 예약 반환을 시도하므로 단독 SQL/handler 배포하지 않는다. 기존 원격 sandbox는 그대로다. Vercel 프로젝트 연결/인증과 실제 테스트 계정도 없다. 커밋·push·PR을 수행하지 않았다.

호출 기록을 저장한 직후 프로세스가 종료돼 실제 POST가 실행되지 않은 경우도 자동 재취소하지 않는다. 같은 요청의 조회로 완료를 증명할 수 없으면 운영 대조 대상으로 남긴다. 추가 외부 취소가 섞여 예상 잔액이 다르거나 카드 이외 수단인 경우도 수동 검토 대상이다. 운영자 검토/예약 해제 도구와 cross-browser 요청 복구, 결제사 webhook·주기적 대조 작업은 아직 없다. 서비스 사용자에게 직접 금융 행 수정이나 키 교체를 안내하지 않는다.

실계정 카드 테스트 부분 취소·연속 부분 취소·응답 유실/DB 실패 여정과 제공자 거래-원장 대조, 운영 복구 절차가 배포 gate다. 멤버십 주문 키 생명주기·활성/만료/취소 entitlement 통합은 다음 개발이다. live merchant·환불/미성년자 정책·지급 계약은 별도이며 자동 현금화·Billing을 활성화하지 않았다.

공식 근거: [취소·부분 취소 가이드](https://docs.tosspayments.com/guides/v2/cancel-payment), [Core API](https://docs.tosspayments.com/reference).

증거: `/Users/ldy/.codex/visualizations/2026/10/02/01a0fb93-cf0c-7ca3-bd07-7700d1ce9f00/development-phase-10/`.
