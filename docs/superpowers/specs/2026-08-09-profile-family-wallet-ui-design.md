# Profile, Family, and Wallet UI Design

## Goal

학생과 보호자 화면의 시각적 일관성을 높이고, 역할에 맞는 가족 연결 흐름과 실제 프로필 이름 표시를 제공한다. 포인트 환급은 전액 또는 직접 입력을 지원하고 Toss 테스트 충전에는 300,000P 프리셋을 추가한다.

## Scope

- 학생 환급 화면: `전액 선택`과 직접 입력을 함께 제공한다.
- Toss 테스트 충전: 기존 프리셋에 `300,000P`를 추가한다.
- 보호자 마이페이지: 연결 코드 발급기를 `연결 학생` 카드에 항상 표시한다.
- 학생 마이페이지: 연결 코드 입력기는 버튼을 누른 뒤에만 표시한다.
- 보호자 전체 화면: 학생 화면과 같은 Hero, 카드 그리드, 지표 카드, 여백과 버튼 계층을 사용한다.
- 학생·보호자 마이페이지: 현재 사용자의 `profiles.display_name`을 로그인 계정 정보에 표시한다.
- 보호자 연결 학생 목록: 각 학생을 `profiles.display_name`으로 구분한다.

## Architecture

### Profile loading

마이페이지 route는 서버 컴포넌트에서 인증 역할을 확인한 뒤 자신의 `profiles.display_name`만 조회한다. 현재 학생 마이페이지의 상태 기반 UI는 client component로 분리하고 서버에서 받은 이름을 prop으로 전달한다. 이름이 비어 있으면 `이름 미설정`을 표시하며 OAuth metadata를 클라이언트에서 다시 신뢰하지 않는다.

### Guardian linked-student read boundary

보호자가 다른 사용자의 `profiles`를 직접 조회하도록 RLS를 넓히지 않는다. 새 읽기 전용 `security definer` RPC는 다음 조건을 모두 검사한다.

- 호출자는 `auth.uid()`로 확정한다.
- 호출자의 `profiles.role`은 `guardian`이어야 한다.
- `family_links.status = 'active'`이고 해당 보호자가 소유한 연결만 반환한다.
- 반환 필드는 학생 ID, `display_name`, 연결 시각으로 제한한다.
- 방문 URL, 검색어, 활동 원본, 공유 설정 원본은 반환하지 않는다.

RPC는 `authenticated`에만 실행 권한을 부여하고 입력받은 guardian ID를 신뢰하지 않는다.

### Wallet amount contracts

충전 프리셋은 웹, Edge Function parser, PostgreSQL RPC에서 모두 정확히 다음 값만 허용한다.

```text
10,000 / 30,000 / 50,000 / 100,000 / 150,000 / 300,000
```

DB migration은 기존 원장 row를 변경하지 않고 `create_topup_payment_order`의 허용 목록만 additive하게 교체한다. Toss는 계속 `test_ck_`, `test_sk_`, `TOSS_PAYMENT_MODE=test`만 허용한다.

환급 화면의 `전액 선택`은 현재 서버에서 받은 `earnedAvailable` 값을 입력 상태에 복사한다. 사용자는 이후 값을 수정할 수 있다. 잔액이 0이면 전액 버튼과 신청 버튼은 비활성화하며, 서버는 기존처럼 earned 잔액을 다시 검증한다.

## UI Design

### Student my page

로그인 계정 카드에 `display_name`을 표시한다. 보호자 연결 카드는 기본 상태에서 연결 설명과 `보호자 연결 코드 입력하기` 버튼만 표시한다. 버튼 클릭 시 6자리 입력 폼이 같은 카드 안에서 확장되고 `닫기`로 다시 접을 수 있다.

### Guardian my page

학생 마이페이지와 동일한 제목 영역 및 3열 `settings-grid`를 사용한다. 로그인 계정 카드에 보호자의 `display_name`을 표시한다. `연결 학생` 카드는 별도 페이지 이동 버튼 대신 코드 발급·재발급·취소 UI를 직접 렌더링하고, 그 아래 활성 학생을 이름별로 표시한다.

연결 학생이 여러 명이면 각 row의 기본 식별자는 `display_name`이며, 중복 이름을 구분할 수 있도록 짧게 마스킹한 사용자 ID를 보조 정보로 표시한다.

### Guardian home, students, history

학생 화면과 같은 dark navy Hero, 카드 폭, 지표 카드, CTA 스타일을 재사용한다. 보호자 기능과 문구는 유지한다. `/guardian/students`는 상세 학생 목록 화면으로 남기되 코드 발급의 유일한 진입점으로 사용하지 않는다.

## Error Handling

- 프로필 조회 실패 시 raw Supabase 오류를 노출하지 않고 이름 fallback을 표시한다.
- 연결 학생 RPC 실패 시 빈 목록으로 위장하지 않고 `학생 목록을 불러오지 못했습니다`와 재시도 안내를 표시한다.
- 코드 발급 오류는 기존 안전한 Edge Function 오류 코드만 표시한다.
- 환급 전액 선택 후 잔액이 변경되더라도 서버가 최종 잔액을 검증한다.
- 300,000P가 웹에서 변조되어 전달되어도 Edge Function과 DB가 각각 허용 목록을 검사한다.

## Database Migration

`202608090008_guardian_profile_and_300k_topup.sql`에서 다음을 수행한다.

1. `create_topup_payment_order(uuid,bigint,text)`를 교체해 300,000P를 허용한다.
2. `get_guardian_linked_students()` 읽기 전용 RPC를 추가한다.
3. RPC 권한을 최소화한다.
4. 기존 active family link와 wallet transaction은 수정하지 않는다.

새 테이블은 추가하지 않는다.

## Testing

- 환급 전액 선택 helper가 `earnedAvailable`을 정확히 반환하고 0/잘못된 값을 거부하는지 검사한다.
- 충전 프리셋, callback parser, Edge parser에 300,000P가 포함되고 200,000P는 계속 거부되는지 검사한다.
- 학생 연결 입력 surface가 기본 접힘 상태인지 검사한다.
- 보호자 마이페이지에 코드 발급 surface와 학생 이름 목록이 있고 코드 입력 surface가 없는지 검사한다.
- profile display model의 정상 이름과 fallback을 검사한다.
- pgTAP으로 guardian RPC의 역할 제한, 활성 연결 제한, 반환 필드와 300,000P 주문을 검사한다.
- 전체 Vitest, typecheck, lint, Next.js build를 실행한다.
- migration 배포 후 원격 DB lint와 함수 상태를 확인한다.

## Deployment

웹 UI는 Vercel 재배포가 필요하다. Supabase에는 migration `202608090008`을 배포하고, 300,000P parser 변경이 포함된 `wallet-create-topup-order` Edge Function을 다시 배포한다. 새로운 secret은 필요하지 않다.
