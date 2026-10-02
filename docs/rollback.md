# Mirujima v3 Rollback 절차

기준일: 2026-08-24

## 원칙

- 금융·정산 오류가 의심되면 새 요청 수신부터 중단한다.
- `wallet_transactions`의 posted 행을 수정하거나 삭제하지 않는다.
- 운영 migration을 역실행하지 않는다. 호환 가능한 forward 보정 migration을 추가한다.
- 이미 승인된 Toss 결제와 DB 원장을 각각 확인하며, 한쪽만 되돌리지 않는다.
- rollback 중에도 idempotency key와 provider order/payment key를 보존한다.

## 즉시 안정화

1. 영향 기능의 진입 UI와 Edge Function을 비활성화한다.
2. 새 topup, refund, guardian reward, focus settlement, membership 요청을 차단한다.
3. 실패 시각, user id, orderId/sessionId, idempotency key를 기록한다. Secret과 결제 인증값은 로그에 남기지 않는다.
4. 진행 중 집중은 Extension 로컬 상태를 유지하고 정산 결과를 pending queue에 보존한다.

## 구성요소별 rollback

### 1. Web/PWA

1. Vercel에서 직전 정상 배포를 production으로 승격한다.
2. Service Worker cache 이름을 새 버전으로 올려 결함 cache를 폐기한다.
3. 공개 페이지와 offline fallback만 cache되는지 확인한다.
4. 결제 callback URL과 Extension origin이 직전 버전과 호환되는지 확인한다.

### 2. Edge Function

1. 영향 Function의 직전 검증 commit을 다시 배포한다.
2. Toss/AI Secret은 교체가 필요한 사고가 아니면 변경하지 않는다.
3. 동일 idempotency key 재시도와 중복 posted 방지를 검증한다.
4. 테스트 프로젝트에서 pgTAP과 대표 요청을 재검증한 뒤 요청 수신을 재개한다.

### 3. Chrome Extension

1. Web에서 결함 기능 시작을 막아 이미 배포된 Extension과의 신규 조합을 차단한다.
2. 직전 정상 Extension 빌드로 회귀 버전을 준비한다.
3. Web Store의 즉시 rollback을 가정하지 말고 서버/Web 하위 호환을 유지한다.
4. 기존 active session의 alarm, DNR, local pending settlement를 지우지 않는다.

### 4. Supabase migration

1. Remote migration 상태와 DB lint를 읽기 전용으로 확인한다.
2. 문제가 된 schema/RPC의 이전 계약을 복원하는 additive forward migration을 작성한다.
3. 신규 column/table을 즉시 drop하지 않는다. 구버전 Web/Extension이 남아 있을 수 있다.
4. 원장 보정이 필요하면 기존 posted 행을 변경하지 않고 관련 transaction을 참조하는 보정 transaction을 생성한다.
5. pgTAP을 transaction+rollback으로 통과시킨 뒤 migration을 적용한다.

## 권장 실행 순서

장애 완화는 사용자 트래픽에 가까운 계층부터 수행한다.

```text
기능 진입 차단
→ Web/PWA 직전 버전 승격
→ Edge Function 직전 버전 배포
→ Extension 호환 버전 준비/제출
→ Supabase forward 보정 migration
→ DB/원장 대사
→ 제한적 재개
```

DB 보정이 먼저 필요한 보안/RLS 사고에서는 요청을 차단한 상태로 RLS forward migration을 우선 적용한 뒤 나머지를 진행한다.

## 금융 대사

- Toss 승인 성공 + posted topup 없음: provider 조회 후 동일 idempotency key로 서버 확정 재시도
- Toss 승인 없음 + posted topup 있음: 새 거래 차단 후 보정 transaction과 사고 기록 작성
- Toss 취소 성공 + refund posted 없음: provider 취소 내역 확인 후 동일 요청을 멱등 재처리
- 중복 posted 의심: 행을 삭제하지 않고 unique key와 관련 transaction을 확인해 보정
- focus 완료 + deposit 미정산: canonical session 종료 시각을 검증하고 동일 session key로 재시도

## 복구 완료 조건

- [ ] migration Local/Remote 일치
- [ ] DB lint error 0
- [ ] 영향 pgTAP 전부 통과 및 rollback 확인
- [ ] Edge Function 대표 요청 통과
- [ ] 중복 원장/미정산 세션/미읽은 실패 queue가 없음
- [ ] Web와 Extension 버전 조합 smoke test 통과
- [ ] 원인, 영향 범위, 보정 transaction, 재발 방지 테스트 기록 완료
