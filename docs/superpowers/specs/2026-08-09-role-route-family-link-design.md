# 역할별 경로 보호 및 가족 연결 UX 설계

## 목표

학생과 보호자가 자신의 화면과 navigation만 사용하도록 모든 보호 경로를 서버에서 검증하고, 보호자 전용 마이페이지와 보호자 발급·학생 입력 방식의 가족 연결을 제공한다.

## 확인된 원인

- 보호자 navigation의 마이페이지가 `/my`를 가리킨다.
- `/my`는 `DashboardShell role="student"`로 고정되어 보호자가 접근하면 학생 navigation이 렌더링된다.
- 보호자 전용 마이페이지 경로와 컴포넌트가 없다.
- `FamilyLinkPanel`이 코드 발급과 입력을 함께 렌더링하여 역할별 책임을 구분하지 않는다.
- 가족 연결 DB RPC는 학생과 보호자 양쪽 발급을 허용한다.
- `family-link-issue`와 `family-link-redeem`은 `MIRUJIMA_APP_ORIGIN` 하나만 허용한다. 원격 확인 결과 `https://mirujima.vercel.app`은 OPTIONS `200`, `http://localhost:3000`은 `403`이어서 로컬 발급이 차단된다.
- UI가 Edge Function의 안전한 오류 코드를 읽지 않고 generic 문구만 표시해 원인을 숨긴다.

## 역할별 경로표

### 학생 전용

```text
/home
/focus
/history
/my
/wallet/cashout
```

### 보호자 전용

```text
/guardian
/guardian/students
/guardian/history
/guardian/my
```

### 로그인 사용자 공용

```text
/membership/checkout
/membership/success
/membership/fail
/wallet/charge
/wallet/charge/success
/wallet/charge/fail
```

### 공개

```text
/
/onboarding
/auth/callback
/how
/privacy
```

## 중앙 역할 가드

서버 전용 helper가 Supabase 세션과 `profiles.role`을 조회해 `student | guardian`을 반환한다. 보호 페이지는 렌더링 전에 이 helper를 호출한다.

- 비로그인 사용자는 `/onboarding`으로 이동한다.
- role이 없거나 잘못된 사용자는 `/onboarding`으로 이동한다.
- 보호자가 `/my`에 접근하면 의미상 대응 경로인 `/guardian/my`로 이동한다.
- 학생이 `/guardian/my`에 접근하면 `/my`로 이동한다.
- 보호자가 그 외 학생 전용 경로에 접근하면 `/guardian`으로 이동한다.
- 학생이 그 외 보호자 전용 경로에 접근하면 `/home`으로 이동한다.
- redirect 이전에는 다른 역할의 페이지 본문이나 데이터를 조회하지 않는다.

`DashboardShell`의 role은 페이지가 임의로 지정하는 표시값이 아니라 검증된 서버 role에서 전달한다. navigation은 다음 경로만 제공한다.

```text
학생: /home, /focus, /history, /my
보호자: /guardian, /guardian/students, /guardian/history, /guardian/my
```

로그인 사용자 공용 페이지의 복귀 링크는 role에 따라 학생 `/my`, 보호자 `/guardian/my`를 사용한다.

## 보호자 마이페이지

`/guardian/my`는 보호자 navigation을 유지하고 다음 카드만 표시한다.

- 로그인 계정 정보
- 보호자 포인트 지갑과 `/wallet/charge` 이동
- Premium 멤버십과 `/membership/checkout` 이동
- 연결 학생 요약과 `/guardian/students` 이동
- 가족 활동 요약
- 학생 보상 요청 관리

학생 전용 공유 설정, earned 현금화, 보호자 연결 해제 UI는 표시하지 않는다.

## 가족 연결 방향

가족 연결은 보호자 발급·학생 입력으로 단방향화한다.

### 보호자

`/guardian/students`에서 다음만 제공한다.

- 6자리 연결 코드 발급
- 남은 시간 표시
- 재발급
- 발급 취소
- 연결 학생 목록

보호자에게 받은 코드 입력 UI를 표시하지 않는다.

### 학생

`/my`의 보호자 연결 카드에서 다음만 제공한다.

- 받은 6자리 코드 입력
- 입력 실패/잠금/만료 안내
- 연결된 보호자 요약
- 안전 조건을 충족하는 연결 해제

학생에게 코드 발급 UI를 표시하지 않는다. 학생이 직접 코드를 입력하는 동작을 보호자 연결 동의로 본다.

## 서버 강제 규칙

UI 숨김만으로 권한을 결정하지 않는다.

- `issue_family_link_code`는 `profiles.role = 'guardian'`만 허용한다.
- `redeem_family_link_code`는 `profiles.role = 'student'`만 허용한다.
- 발급 row는 `guardian_user_id = issuer_user_id`, `student_user_id = null` 형태만 허용한다.
- 입력 성공 시 `student_user_id = auth user`, `guardian_user_id = issuer`로 확정한다.
- 같은 학생의 활성 보호자는 한 명만 허용한다.
- 코드는 5분, 단일 사용, 재발급 시 기존 pending 폐기, 5회 실패 잠금을 유지한다.
- Edge Function은 access token의 사용자와 RPC actor ID를 일치시킨다.

기존 학생 발급 pending 코드는 migration에서 `revoked`로 바꾸고 hash를 제거한다. 기존 active 연결은 유지한다.

## Origin allowlist

단일 `MIRUJIMA_APP_ORIGIN` 대신 comma-separated `MIRUJIMA_ALLOWED_ORIGINS`를 사용한다.

```text
https://mirujima.vercel.app,http://localhost:3000
```

Edge Function은 요청 Origin을 trim한 exact origin 집합으로 비교하며 wildcard, suffix match, `*.vercel.app`을 허용하지 않는다. 허용된 Origin만 CORS 응답에 반영하고 `Vary: Origin`을 유지한다.

## 오류 처리

가족 연결 Edge Function은 다음 안전 코드를 반환한다.

```text
origin_not_allowed
authentication_required
guardian_role_required
student_role_required
issue_rate_limited
active_guardian_exists
invalid_code_format
invalid_or_expired_code
redeem_locked
family_link_already_exists
family_link_service_unavailable
```

클라이언트는 이 코드만 한국어 안내로 매핑하며 DB 원문, 사용자 UUID, code hash, secret을 노출하지 않는다. 서버 로그에는 function name, 안전 오류 코드, status만 남긴다.

## 테스트

- navigation 테스트에서 보호자 마이페이지가 `/guardian/my`인지 검증
- role guard 단위 테스트에서 모든 학생·보호자·공용·공개 경로의 redirect 표 검증
- 보호자 `/my`와 학생 `/guardian/my` 직접 접근 redirect 검증
- 보호자 마이페이지 렌더링과 학생 전용 카드 부재 검증
- 가족 UI 테스트에서 보호자는 발급만, 학생은 입력만 렌더링하는지 검증
- pgTAP에서 학생 발급 거절, 보호자 입력 거절, 보호자 발급·학생 입력 성공 검증
- 기존 학생 발급 pending code가 revoked되는 migration 검증
- Origin parser 단위 테스트에서 production·localhost 허용, 다른 origin 거절 검증
- Edge Function 안전 오류 코드 매핑 테스트
- Browser QA로 역할별 탭, 직접 URL 접근, 코드 발급·입력 흐름 확인
- 웹 테스트, 타입 검사, 린트, production build, Supabase migration 및 Edge Function 배포 상태 확인

## 기존 작업과의 관계

Toss 포인트 충전의 `/wallet/charge`는 학생·보호자 공용이며 role별 복귀 링크를 사용한다. `/wallet/cashout`은 학생 전용이다. slash navigation 설계의 `/how`, `/privacy`는 공개 경로다. 세 설계는 하나의 구현 계획에서 경로표를 공유하되 재무 RPC와 가족 연결 RPC를 결합하지 않는다.
