# 결제 출시 직전 준비 결과

2026-10-02. 요청: Toss API 테스트 모드 유지, 사용자 화면에서 테스트 문구 제거, 실제 production 전환 직전 준비.

**로컬 코드·SQL·빌드 검증을 완료했다. 원격 production 승격, Toss live 활성화, 실제 제공자 결제 인증/승인/취소는 실행하지 않았다. 현재 원격 DB/함수와 이번 코드가 모두 일치하는 상태는 아니다. 따라서 현재 상태를 ‘키만 교체하면 출시 승인 완료’로 표현하지 않는다.**

## 1. 구현한 기능

- 충전, 멤버십, AI 가입 CTA, 가족 좌석, 보호자 지갑, 환불, 거래 내역, 개인정보 안내에서 제품에 노출되는 테스트/sandbox 문구를 제거했다. 모드와 관계없이 승인·처리 결과 중심 문구를 사용한다.
- 결제사 취소가 확인된 결과와 내부 기록 반영을 구분한다. 내부 기록을 실제 계좌 입금/송금 완료로 표시하지 않는다.
- 현금화 신청 UI와 서버 `cashout-request`를 비활성화했다. 실제 송금 없이 원장만 완료 처리하던 자동 경로를 제거했다. 과거 기록을 삭제하지 않는다.
- 잔액 조회가 실패해도 현금화 준비 안내와 신청 차단을 유지한다. 조회 실패를 0P 잔액으로 바꾸지 않는다.
- 실제 원격 검사에서 학생 `wallet-summary` 500, 보호자 200을 확인했다. 원인은 학생에게 보호자 전용 환불 한도 RPC를 호출하는 것이었다. 학생은 실제 잔액만 조회하고 환불 한도는 정책상 0, 보호자는 기존 RPC 한도를 쓰도록 서버 코드를 수정했다. 이 수정은 로컬 검사 완료, 원격 배포는 보류 상태다.
- 운영 모드 경로를 준비했다. Web은 명시적 live 모드 + live_ck + HTTPS, 서버는 live 모드 + live_sk + 별도 server-only live 활성화 스위치가 모두 필요하다. 현재 공개 설정은 test + test_ck이며 live 키가 아님을 값 비노출 검사로 확인했다.
- 환불은 기존 sandbox/provider_test와 추가 provider_live 계약을 분리한다. 기존 예약을 다른 모드로 바꾸거나 다른 모드 영수증으로 정산하지 못한다.
- 사전 점검이 widget 키를 허용하지만 실제 SDK는 개별 결제창 키만 허용하던 불일치를 수정했다. 공개 Secret 검사도 test artifact의 live key 유출은 차단하고, 명시적 live artifact에서는 공개 client key만 허용한다. server secret 금지는 항상 유지한다.

## 2. 변경 파일

주요 경계:

- `apps/web/features/membership/payment.ts`, `checkout.tsx`, 관련 성공/실패 및 가입 CTA
- `apps/web/features/wallet/{topup-panel,refund-panel,cashout-panel,wallet-history-panel,topup-history-modal}.tsx`
- `apps/web/app/wallet/cashout/page.tsx`, `features/wallet/cashout-modal.tsx`, `e2e/authenticated-flow.spec.ts`
- `apps/web/app/privacy/page.tsx`, 보호자 지갑 안내, `apps/web/.env.example`
- `supabase/functions/_shared/{toss,refund-recovery}.ts`, 결제 주문/승인/환불 handler, `cashout-request/index.ts`, `wallet-summary/index.ts`
- `scripts/{deployment-config,check-public-secrets}.mjs`, 관련 검사, `package.json`
- 새 현금화 차단·지갑 역할·UI 회귀 테스트와 `payment_launch_refund_modes.test.sql`
- [전환 절차](../../payment-launch-runbook.md), [릴리스 체크리스트](../../release-checklist.md)

기존 대규모 미커밋 개발 변경을 보존했다. 커밋·push·PR은 수행하지 않았다.

## 3. DB migration

`supabase/migrations/202610020017_payment_launch_refund_modes.sql` 추가. 기존 service-only RPC `prepare_topup_refund`, `complete_topup_refund`, `reject_topup_refund`를 교체한다. 신규 테이블/원장 데이터 수정 없음. 기존 잠금·멱등성·소유권·receipt 검증을 유지한다. 0011 이후에 적용해야 하며 이번에는 **로컬 DB에만 적용**했다.

## 4. 기존 기능 영향

테스트 결제 SDK/API 모드는 유지한다. 충전/멤버십의 주문 복원·중복 승인·결과 조회·잔액 확정 경계를 보존한다. 보호자 원 결제 환불과 획득 포인트 현금화는 계속 분리한다. 기존 현금화 시뮬레이션 신청·자동 완료 기능은 실제 지급으로 오인될 수 있어 출시 경로에서 제거했다. 원장과 과거 정산 내역은 유지한다.

## 5. 보안·권한

서버 live 스위치는 public env가 아니다. 클라이언트 변경만으로 실제 결제를 허용하지 않는다. test/live 키 혼용과 개별 연동/widget 키 혼용을 거절한다. 현금화 서버는 로그인 확인 후 503으로 종료하며 RPC·예약·완료를 실행하지 않는다. 학생 전용 화면은 canonical profile role로 제한한다. 금융 RPC 권한은 service_role 전용이고 기존 authenticated/anon 차단을 유지한다. 세션·비밀 키·payment key 값을 보고서나 공개 artifact로 복사하지 않았다.

## 6. 실행한 테스트

| 검사 | 결과 |
|---|---|
| 최종 전체 Vitest | 88 파일 / 482개 통과 |
| 최종 로컬 SQL pgTAP | 34 파일 / 677개 단언 통과, transaction fixture rollback |
| 실제 학생 로그인 Web E2E | 4개 통과: 대시보드, modal focus/Escape, 기록 접근성, 결제 문구/현금화 차단 |
| 실제 보호자 로그인 Web E2E | 3개 통과, 학생 전용 검사 1개 의도적 제외; 환불 문구와 학생 전용 경로 접근 차단 포함 |
| 실제 원격 wallet-summary 조회 | 학생 500/보호자 200 재현; 학생 서버 수정은 별도 단위 검사 3개 통과, 원격 미반영 |
| 결제 모드 공개 설정 확인 | test, test_ck 일치, live key 아님; 값은 출력하지 않음 |
| candidate origin 사전 점검 | HTTPS/exact origin/동일 backend/키/ID 형식 통과, VAPID 없음으로 전체 gate 미통과 |
| git diff --check | 통과 |

충전·멤버십 승인/응답 유실·조회 복구, 환불 부분 취소/중복 재조회·타인 요청·mode 혼용 방지 검사는 로컬 모의 HTTP 및 SQL 검증이다. **Toss가 실제 발급한 결제의 인증→승인→취소 실호출 통과를 의미하지 않는다.** 로그인 쿠키는 실제 Supabase Auth 세션이며 Google OAuth 전체 여정은 별도 미검증이다.

브라우저 초기 실패 두 건은 숨겨진 배경 navigation을 기대한 검사 단언과 잔액 실패 시 현금화 준비 안내가 사라진 UI에서 발생했다. 단언과 UI를 각각 수정한 뒤 위 최종 결과를 확인했다. Next 개발 서버의 빠른 페이지 이동에서 stream-close 로그가 있었지만 최종 브라우저 단언은 모두 통과했다.

## 7. 빌드 결과

최종 `npm run verify:local` 통과: root/Web lint·typecheck, Web/Extension production build, 공개 번들 Secret 검사 63파일. 현재 코드의 결과이며 이전 preview 배포 결과로 대체하지 않았다.

Vercel CLI는 로그아웃 상태를 유지했다. 이번 변경을 원격 preview/production으로 배포하지 않았다. 이전 배포는 이번 문구·서버 수정이 포함된 artifact가 아니다.

## 8. 남은 production gate

1. 별도 검증 환경에서 보류 `0003/0006/0007/0010/0011/0012`와 새 `0017`, 대응 Edge Function 및 새 Web/Extension을 함께 적용한다. `wallet-summary` 학생 오류 수정과 `cashout-request` 차단 코드도 배포 후보에 포함한다.
2. 같은 MID의 test 키로 실제 Toss 인증/승인/부분 취소 및 원장/멤버십 대조를 완료한다. SDK 결제창 자체의 표시 문구는 서비스 UI 제거 대상과 구분한다.
3. 실제 origin Google OAuth·결제 return URL·Extension 연동, VAPID/실기기 Push, 지원 Chrome 설치본·복구 증거를 완료한다. 현재 후보 설정에는 VAPID 키가 없다.
4. 검증한 revision과 artifact를 확정하고 기존 `verify:release:evidence`를 완료한다. 현재 미커밋 상태는 최종 릴리스 승인 상태가 아니다.
5. 실제 결제 전환은 계약·정책·미성년자 검토와 운영 데이터 분리 후 진행한다. 테스트 원장 잔액을 운영 금융 잔액으로 재사용하지 않는다. [운영 전환 순서](../../payment-launch-runbook.md)에 따라 환경 설정과 Web 재빌드 및 서버 gate 전환을 수행한다. 현금화는 별도 제공자 계약/구현 전까지 계속 비활성화한다.

공식 근거: [Toss API 키 세트와 test/live 구분](https://docs.tosspayments.com/reference/using-api/api-keys), [개별 결제창 인증·승인 흐름](https://docs.tosspayments.com/guides/v2/payment-window/integration).
