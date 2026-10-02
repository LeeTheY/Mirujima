# 실제 집중 기록 조회 설계

**목표:** 웹과 Chrome Extension에서 완료된 canonical 집중 세션이 학생 기록 탭에 실제로 표시되고, 보호자는 학생이 공유에 동의한 집계만 조회하도록 한다.

**범위:** 학생 `/history`, 보호자 `/guardian/history`, 집중 metric 동기화 RPC, 학생·보호자 기록 조회 RPC, 공유 계약과 회귀 테스트. 신규 테이블은 추가하지 않는다.

## 1. 현재 문제

학생과 보호자 기록 페이지는 현재 모든 값을 `0`으로 표시하는 정적 화면이다. `cloud_focus_sessions`, `cloud_reports`, `cloud_learning_days`에는 기록을 저장할 기반이 있지만 웹 기록 화면에는 이를 읽는 데이터 계층이 없다.

canonical 집중 세션은 목표 결과와 포인트 정산을 서버에 저장하지만, 확장 프로그램에서만 알 수 있는 차단 시도·유휴·주의 분산·상태 확인 횟수는 서버 세션에 반영되지 않는다. 보호자가 학생 raw table을 직접 조회하도록 허용할 수도 없다.

## 2. 선택한 접근

기존 `cloud_focus_sessions.payload`를 완료 세션의 기준 데이터로 사용하고, security definer RPC에서 기간 집계와 보호자 privacy filtering을 수행한다.

대안은 다음 이유로 선택하지 않는다.

- 클라이언트 직접 집계: 구현은 빠르지만 집계 규칙이 화면에 분산되고 보호자 권한 실수 위험이 크다.
- 통계 전용 신규 테이블: 큰 데이터 규모에는 유리하지만 현재 요구에는 과도하며 기존 테이블 우선 원칙과 맞지 않는다.
- `cloud_reports` 단독 조회: 기존 확장 프로그램 일일 리포트는 cloud-sync entitlement와 동기화 시점에 의존해 canonical 웹 세션의 즉시 기록을 보장하지 않는다.

## 3. 데이터 원천과 기간 규칙

기록 대상은 `cloud_focus_sessions`에서 `deleted_at is null`이고 payload status가 다음 중 하나인 행이다.

- `success`
- `failed`
- `cancelled`

세션 날짜는 우선 `payload.result.settledAt`, 없으면 `payload.updatedAt`, 마지막으로 row `updated_at`을 사용자의 `profiles.timezone`으로 변환해 결정한다. 잘못되거나 지원되지 않는 timezone은 `Asia/Seoul`로 보정한다.

기간 규칙:

- `daily`: anchor date 하루
- `weekly`: anchor date가 속한 월요일부터 일요일까지 7일
- `monthly`: anchor date가 속한 달의 첫날부터 마지막 날까지

지원 범위는 현재 날짜 기준 최근 365일이다. 미래 anchor date 또는 범위를 벗어난 date는 거부한다.

## 4. 공유 응답 계약

### 4.1 학생 기록

`get_student_focus_history(p_period text, p_anchor_date date)`는 인증 사용자 본인의 기록만 반환한다.

응답:

```ts
interface StudentFocusHistory {
  period: "daily" | "weekly" | "monthly";
  range: { startDate: string; endDate: string };
  summary: {
    completionRate: number;
    totalFocusMinutes: number;
    successfulSessionCount: number;
    failedSessionCount: number;
    completedGoalCount: number;
    totalGoalCount: number;
    focusStreakDays: number;
    earnedPoints: number;
    returnedPoints: number;
    blockedAttemptCount: number;
  };
  trend: Array<{
    dateKey: string;
    focusMinutes: number;
    successfulSessionCount: number;
    failedSessionCount: number;
    completionRate: number;
  }>;
  sessionCount: number;
  sessionsTruncated: boolean;
  sessions: Array<{
    sessionId: string;
    scheduleId: string;
    dateKey: string;
    startedAt: string;
    settledAt: string;
    status: "success" | "failed" | "cancelled";
    focusMinutes: number;
    targetFocusMinutes: number;
    completionPercent: 0 | 60 | 80 | 100;
    completedGoalCount: number;
    totalGoalCount: number;
    earnedPoints: number;
    returnedPoints: number;
    blockedAttemptCount: number;
    goals: Array<{
      goalId: string;
      name: string;
      minutes: number;
      priority: "low" | "medium" | "high";
      completed: boolean;
    }>;
  }>;
}
```

집중 시간은 `accumulatedFocusSeconds`를 분으로 내림하지 않고 합산한 뒤 최종 표시 단계에서 반올림한다. 성공·실패 수와 완료율은 terminal result를 기준으로 계산한다. 스트릭은 전체 기록에서 anchor date 이전까지 연속으로 성공 세션이 하나 이상 존재한 날짜 수다. `trend`는 조회 범위의 모든 날짜를 0 포함 연속 배열로 반환한다. summary는 전체 기간 행을 사용하되 상세 `sessions`는 최신 200개로 제한하고 잘림 여부를 별도로 표시한다.

### 4.2 보호자 기록

`get_guardian_focus_history(p_student_user_id uuid, p_period text, p_anchor_date date)`는 다음을 모두 검증한다.

1. 호출자가 guardian 역할이다.
2. 요청 학생과 `family_links.status = 'active'` 관계다.
3. 학생의 `sharing_preferences`를 필드별로 적용한다.

보호자 응답은 학생 응답을 그대로 재사용하지 않는다. 목표명, 목표 설명, 도메인, 차단 시도, 유휴·주의 분산 정보는 항상 제외한다.

```ts
interface GuardianFocusHistory {
  student: { userId: string; displayName: string };
  period: "daily" | "weekly" | "monthly";
  range: { startDate: string; endDate: string };
  sharing: {
    completion: boolean;
    totalFocusMinutes: boolean;
    rewardStatus: boolean;
  };
  summary: {
    completionRate: number | null;
    totalFocusMinutes: number | null;
    completedGoalCount: number | null;
    rewardCount: number | null;
  };
  trend: Array<{
    dateKey: string;
    completionRate: number | null;
    focusMinutes: number | null;
  }>;
}
```

공유가 꺼진 값은 `0`이 아니라 `null`로 반환해 실제 0과 비공개를 구분한다. `rewardCount`는 해당 기간 학생 세션과 연결된 `wallet_transactions` 중 보호자 보상 요청·예약·지급·반환 상태를 중복 session ID 없이 집계한다.

## 5. Extension metric 동기화

`sync_focus_session_metrics(p_session_id text, p_device_id text, p_metrics jsonb)` RPC를 추가한다.

허용 필드:

- `blockedAttemptCount`
- `idleSeconds`
- `distractionSeconds`
- `checkInCount`

각 값은 0 이상의 안전한 integer이며 상한을 둔다. 호출자는 세션 소유자여야 한다. 서버는 `greatest(existing, incoming)`으로만 갱신해 반복 호출과 오래된 장치 요청이 값을 되돌리지 못하게 한다. URL, hostname, 페이지 내용, 입력값은 받지 않는다.

확장 프로그램은 다음 시점에 best-effort로 metric을 보낸다.

1. 1분 canonical reconciliation 직전
2. canonical pause 직전
3. canonical finish 직전
4. 웹에서 끝난 세션의 reconcile 요청을 처리하기 직전

metric 전송 실패는 타이머와 차단을 중단시키지 않는다. 값은 local session에 남고 다음 reconciliation에서 다시 전송한다. 포인트 정산 RPC와 metric RPC는 독립적이며 metric 실패 때문에 금융 정산을 되돌리지 않는다.

기간 조회를 위해 기존 table에 `(user_id, updated_at desc) where deleted_at is null` partial index를 additive하게 추가한다. 신규 table이나 중복 aggregate 저장소는 만들지 않는다.

## 6. Web 구성

### 데이터 계층

- `packages/contracts`: 학생·보호자 기록 응답 Zod schema와 타입
- `apps/web/features/history/history-data.ts`: period/date 검증, RPC 호출, 응답 parsing, 안전한 오류 변환
- `apps/web/features/history/history-calculations.ts`: 표시용 순수 계산과 formatting

### 학생 화면

`apps/web/app/history/page.tsx`는 server component가 search params를 검증하고 학생 RPC를 호출한다. 상호작용 UI는 `StudentHistoryDashboard` client component로 분리한다.

- 일·주·월 segmented links
- 이전/다음 기간 이동
- 계획 달성률, 총 집중 시간, 성공/실패 세션, 스트릭, 포인트, 차단 시도 summary
- 날짜별 집중 추이 CSS bar chart
- 목표 실행 결과 table/card
- 차트와 같은 내용을 제공하는 접근 가능한 텍스트 표
- 정상 empty state와 safe error state

### 보호자 화면

보호자 page server component는 기존 `get_guardian_linked_students()`로 학생 목록을 불러오고 선택 학생 ID를 query parameter로 받는다. 학생을 선택하지 않았으면 첫 활성 학생을 기본값으로 사용한다.

- 연결 학생 selector
- 기간 전환
- 공유 허용 summary와 trend
- 비공개 항목은 “공유 안 함” 표시
- 연결 학생 없음, 데이터 없음, RPC 실패 상태 분리

## 7. 오류 처리와 보안

- period는 `daily`, `weekly`, `monthly`만 허용한다.
- anchor date와 student UUID를 서버와 TypeScript 양쪽에서 검증한다.
- SQL은 `auth.uid()`로 사용자를 다시 확인하고 클라이언트가 user ID를 주입하지 못하게 한다.
- 보호자 RPC는 raw student table 전체를 반환하지 않는다.
- 사용자 UI에는 SQL/Supabase raw error나 stack trace를 노출하지 않는다.
- 오류 화면은 기록 데이터가 삭제되거나 변경되지 않았으며 재시도할 수 있음을 안내한다.
- 모든 public function은 public/anon 실행 권한을 revoke하고 authenticated만 grant한다.

## 8. 테스트

### TypeScript/Vitest

- 기록 응답 parsing과 잘못된 payload 거부
- period/date query parsing
- 기간 이동과 표시 formatting
- empty/error/privacy state
- 학생·보호자 화면의 실제 데이터 표시
- extension metric payload 생성과 canonical 전환 전 동기화 호출

### pgTAP

- 학생 본인 terminal session 집계
- active/paused session 제외
- success/failed/cancelled 포함
- 일·주·월 경계와 timezone
- metric 반복 동기화의 monotonic/idempotent 동작
- 다른 학생 기록 차단
- 연결되지 않은 보호자 차단
- 공유 설정별 null 처리
- 보호자 응답에 raw goal/domain/activity field가 없음

### 전체 회귀

- root와 web Vitest
- root와 web TypeScript 검사
- ESLint
- Extension Vite production build
- Next.js production build

로컬 PostgreSQL/Supabase가 없으면 pgTAP 파일은 migration 순서와 함수 signature를 정적으로 검토하고, 실행하지 못한 사실을 결과에 명시한다.

## 9. 완료 기준

1. 웹에서 완료·저장한 canonical 세션이 학생 기록 탭에 나타난다.
2. 실패·포기 세션도 누락되지 않는다.
3. 일·주·월 전환이 실제 조회 범위를 바꾼다.
4. 확장 프로그램의 차단 시도 집계가 서버 기록에 반영된다.
5. 보호자는 활성 연결 학생의 동의된 aggregate만 본다.
6. 신규 table 없이 기존 JSONB와 RPC를 additive하게 사용한다.
7. 기존 local-only extension 집중 기능과 canonical 포인트 정산이 회귀하지 않는다.
