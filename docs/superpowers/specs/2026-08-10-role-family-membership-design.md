# 역할별·가족 멤버십 설계

기준일: 2026-08-10
상태: 승인됨

## 1. 목표

학생 단독 멤버십과 보호자 가족 멤버십을 역할별 상품으로 분리하고, Toss Payments 테스트 결제 승인 결과를 Supabase의 멤버십 및 AI 권한 데이터에 즉시 반영한다. 가족 연결 시 중복 멤버십으로 이중 결제나 이용 기간 손실이 발생하지 않도록 서버에서 결제와 연결을 함께 검증한다.

포인트와 멤버십 화면은 하드코딩 숫자를 사용하지 않는다. 포인트는 `wallet_transactions`의 `posted` 거래 합계로, 멤버십은 `memberships`와 서버가 계산한 entitlement로 표시한다.

## 2. 상품 정책

### 학생 단독 멤버십

- 상품 코드: `student_premium`
- 가격: 9,900원
- 기간: 결제 승인 시점부터 30일
- 자동 갱신: 없음
- 대상: `profiles.role = 'student'`
- 기능:
  - 집중 계획 AI 첨삭
  - 목표 분할 및 집중·휴식 시간 추천
  - 최근 집중 패턴 기반 학습 추천
  - OCR, 문법 교정, 콘텐츠 요약 등 기존 학생 AI 기능

### 보호자 가족 멤버십

- 상품 코드: `guardian_family`
- 가격: 12,900원
- 기간: 결제 승인 시점부터 30일
- 자동 갱신: 없음
- 대상: `profiles.role = 'guardian'`
- 기본 학생 좌석: 2명
- 최대 연결 학생: 5명
- 기능:
  - 연결 학생에게 학생 단독 멤버십의 AI 기능 제공
  - 보호자에게 학생 동의 범위 내 가족 요약 및 주간 요약 제공

### 추가 학생 좌석

- 세 번째 학생부터 추가 좌석 필요
- 정상 가격: 학생 1명당 3,900원/30일
- 추가 좌석 만료일은 보호자 가족 멤버십 만료일과 일치
- 결제 금액은 남은 이용 시간을 기준으로 일할 계산
- 계산식: `max(500, ceil(3900 * remaining_seconds / 2592000))`
- 보호자 가족 멤버십의 남은 기간이 없으면 추가 좌석을 구매할 수 없음
- 추가 좌석은 특정 학생에게 귀속하지 않고 가족 계정의 가용 좌석으로 관리
- 연결 해제 후에도 결제된 좌석은 만료일까지 다른 학생 연결에 재사용 가능
- 좌석 결제에 대한 자동 부분 환불은 제공하지 않음
- 가족 멤버십 최초 결제 또는 재결제 시 이미 연결된 학생이 3명 이상이면 필요한 추가 좌석을 같은 주문에 포함

## 3. 데이터 모델

기존 테이블을 우선 사용하고 멤버십 행을 연결 학생에게 복제하지 않는다.

### `memberships`

기존 사용자별 멤버십 행에 다음 additive column을 추가한다.

- `product_code text`: `student_premium | guardian_family`
- `included_student_seats integer`: 학생형은 0, 보호자 가족형은 2
- `extra_student_seats integer`: 보호자가 결제한 활성 추가 좌석 수
- 기존 `status`, `current_period_started_at`, `current_period_ends_at`, `billing_integration`, `activation_source` 유지

활성 멤버십 판정은 `status = 'active'`이고 `current_period_ends_at > now()`인 경우로 제한한다.

### `membership_payment_orders`

기존 주문 테이블을 역할별 가격과 추가 좌석 주문에 재사용한다.

- `product_code text`
- `unit_count integer`
- `target_membership_period_ends_at timestamptz null`
- `amount_krw`의 기존 12,900원 고정 제약을 제거하고 서버 계산 금액만 허용
- metadata 또는 additive column에 가격 계산 입력과 결과를 보존

주문 금액, 상품 코드, 역할, 현재 멤버십 및 좌석 상태는 서버가 생성 시점과 승인 시점에 모두 검증한다.

### `membership_entitlements`

- 직접 결제한 학생 entitlement는 학생 본인의 행으로 유지
- 보호자 가족 멤버십을 상속받는 학생 entitlement는 영구 복제하지 않음
- 서버 권한 판정 함수가 `family_links`, 보호자 활성 멤버십, 좌석 수를 조합해 effective entitlement를 반환
- 보호자 AI 기능은 보호자 본인의 entitlement 행으로 관리

### 가족 좌석 판정

`active_student_count`는 해당 보호자의 `family_links.status = 'active'` 학생 수다.

```text
seat_capacity = 2 + extra_student_seats
can_issue_code = active_student_count < seat_capacity and active_student_count < 5
```

세 번째 이후 연결 코드 발급은 추가 좌석 결제 승인 후에만 허용한다. 최종 판정은 코드 발급 RPC 내부에서 다시 수행한다.

## 4. 결제 흐름

### 역할별 멤버십 결제

```text
결제 버튼
→ 서버가 로그인 사용자 역할과 중복 멤버십 검사
→ 역할에 따라 9,900원 또는 12,900원 주문 생성
→ Toss Payments 테스트 결제창
→ success callback
→ 서버가 orderId·paymentKey·amount 재검증
→ Toss 테스트 승인 API
→ DB transaction에서 주문 confirmed 및 memberships 활성화
→ entitlement 갱신
→ 화면에서 서버 데이터를 재조회
```

클라이언트가 가격, 상품 코드, 사용자 ID 또는 entitlement를 확정하지 않는다. 승인 RPC는 주문 생성 당시 저장한 금액과 callback 금액이 다르면 멤버십을 활성화하지 않는다.

보호자 주문 생성 시 연결 학생 전체의 활성 학생 단독 멤버십을 검사한다. 하나라도 활성 상태면 가족형 결제를 차단하고 가장 늦은 만료일을 안내한다. 연결 학생이 3명 이상이면 `required_extra_seats = active_student_count - 2`를 계산해 최초 결제 또는 재결제 금액에 30일 좌석 가격을 함께 포함한다. 예를 들어 연결 학생 3명의 30일 가족형 결제는 12,900원 + 3,900원이다.

### 추가 좌석 결제

```text
연결 코드 발급 클릭
→ 서버 좌석 상태 조회
→ 기본 2좌석이 찬 경우 추가 좌석 모달
→ 남은 기간 기준 서버 일할 금액 생성
→ Toss 테스트 결제 승인
→ extra_student_seats 증가
→ 연결 코드 발급 가능 상태로 전환
```

중복 callback은 `orderId`와 `idempotency_key`로 한 번만 반영한다.

## 5. 중복 멤버십과 가족 연결

### 학생 단독 멤버십 활성 상태에서 보호자를 연결

- 가족 연결 자체는 허용
- 보호자 가족 멤버십 결제는 차단
- 보호자 결제 버튼 클릭 시 학생 이름, 학생 멤버십 만료일, 가족형 이용 가능 시점을 알림 모달로 표시
- 연결 학생 중 한 명이라도 학생 단독 멤버십이 활성이라면 같은 규칙으로 가족형 결제를 차단
- 학생 멤버십을 즉시 종료하지 않음
- 학생 멤버십이 만료된 뒤 보호자가 가족형을 결제할 수 있음

### 보호자 가족 멤버십 활성 상태에서 미가입 학생을 연결

- 좌석이 있으면 연결 허용
- 연결 완료 직후 학생은 보호자 가족 멤버십에서 학생 AI 권한을 상속

### 보호자 가족 멤버십과 학생 단독 멤버십이 모두 활성인 상태에서 연결 시도

- 연결 코드 사용 단계에서 서버가 연결을 차단
- 코드는 유효기간이 남아 있으면 소비하지 않음
- 학생 화면에 두 멤버십을 동시에 사용할 수 없다는 알림 모달 표시
- 학생 단독 멤버십 만료 후 새 코드 또는 아직 유효한 코드로 다시 연결

### 연결 해제

- 학생의 가족 상속 entitlement는 다음 서버 판정부터 즉시 종료
- 보호자의 결제된 좌석 수는 가족 멤버십 만료일까지 유지
- 연결 해제로 추가 좌석 결제를 자동 환불하지 않음

## 6. AI 권한 판정

학생 AI 권한은 다음 중 정확히 하나가 활성일 때 허용한다.

1. 학생 본인의 활성 `student_premium`
2. 활성 가족 연결을 가진 보호자의 활성 `guardian_family`와 가용 좌석

보호자 가족 요약은 보호자 본인의 활성 `guardian_family` entitlement가 있어야 한다. AI Edge Function은 실행마다 effective entitlement RPC를 호출하고, 클라이언트 캐시나 화면 상태만 신뢰하지 않는다.

보호자 요약 입력은 학생이 동의한 다음 집계 정보로 제한한다.

- 목표 달성 여부
- 총 집중 시간
- 완료 단계
- 보상 상태
- 동의한 AI 요약

방문 URL, 검색어, 폼 입력값, 페이지 본문, 화면·카메라 원본은 사용하지 않는다.

## 7. 화면과 알림 모달

- 학생 마이페이지: `학생 Premium`, 9,900원, 학생 AI 혜택 표시
- 보호자 마이페이지: `가족 Premium`, 12,900원, 기본 2좌석과 현재 사용 좌석 표시
- 추가 좌석 모달: 현재 좌석, 최대 5명, 남은 기간, 일할 결제 금액 표시
- 중복 멤버십 모달: 충돌 당사자, 만료일, 가능한 다음 행동 표시
- 미가입 AI 버튼: 버튼은 유지하고 클릭 시 역할별 상품 안내 반투명 모달 표시
- 만료 또는 연결 해제 후 AI 실행: 서버 403을 역할별 안전 문구로 변환
- raw Supabase/Toss 오류와 stack trace는 노출하지 않음

## 8. 오류 코드

서버는 최소 다음 안전 오류 코드를 사용한다.

- `membership_role_mismatch`
- `membership_already_active`
- `student_membership_conflict`
- `guardian_membership_conflict`
- `family_seat_required`
- `family_seat_limit_reached`
- `family_membership_inactive`
- `membership_payment_amount_mismatch`
- `membership_entitlement_required`

결제 승인 실패 시 멤버십과 entitlement를 먼저 활성화하지 않는다. 연결 충돌 시 가족 연결과 코드 사용을 한 transaction 안에서 중단한다.

## 9. 테스트와 회귀 방지

### DB/RPC

- 학생 9,900원 주문 및 활성화
- 보호자 12,900원 주문 및 기본 2좌석
- 추가 좌석 일할 계산과 최소 500원
- 기존 연결 학생이 3명 이상인 보호자의 최초 결제·재결제 금액
- 최대 5명 차단
- 중복 결제 callback 멱등성
- 학생 멤버십 활성 시 보호자 가족형 결제 차단
- 보호자 가족형과 학생 멤버십 충돌 시 연결 차단 및 코드 보존
- 가족 연결 학생의 effective entitlement
- 연결 해제 및 만료 직후 권한 제거
- 다른 사용자의 멤버십·주문·권한 조회 차단

### Web

- 역할별 가격과 혜택
- 좌석 현황 및 추가 결제 모달
- 중복 멤버십 손해 방지 모달
- 미가입 AI 버튼의 멤버십 모달
- 활성 권한 사용자의 AI 요청 허용
- 서버 403의 안전한 안내 문구

### 결제

- Toss 테스트 결제창 호출
- callback 금액 변조 거부
- 승인 성공 후 DB와 화면 상태 일치
- 승인 실패 시 활성 멤버십이 생성되지 않음

## 10. 문서 반영

구현 완료 후 루트 `README.md`에 다음을 기록한다.

- 학생·보호자 상품 가격과 30일 단건 결제
- 보호자 기본 2좌석, 추가 좌석 3,900원 일할 계산, 최대 5명
- 중복 멤버십과 가족 연결 차단 정책
- 가족 멤버십 AI 권한 상속 방식
- Toss 테스트 결제 승인과 Supabase DB 반영 흐름
- 포인트가 하드코딩 값이 아닌 append-only 원장 합계라는 점

## 11. 구현 순서

1. additive DB migration과 권한 RPC
2. 역할별 멤버십 주문 생성·승인 Edge Function
3. 추가 좌석 주문과 연결 코드 서버 차단
4. effective entitlement를 AI Edge Function에 적용
5. 역할별 멤버십 카드와 알림 모달
6. DB·Edge Function·Web 테스트
7. README 동기화
