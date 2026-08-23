# Canonical 집중 세션 수명주기 통합 설계

## 1. 목적

Web에서 시작한 집중 세션을 Web과 Chrome Extension이 서로 다른 로컬 상태로 종료하는 문제를 제거한다. Supabase의 `cloud_focus_sessions.payload`를 단일 기준으로 삼아 새로고침, 일시정지, 재개, 목표 시간 종료, 목표별 결과 제출, 네트워크 복구를 양쪽 클라이언트에서 동일하게 처리한다.

이번 변경으로 다음을 보장한다.

- Web을 새로고침하거나 다시 열어도 진행 중인 세션과 목표 목록을 복구한다.
- Extension의 pause와 awaiting-result 상태가 주기 동기화에 의해 active로 되돌아가지 않는다.
- Web을 닫아도 Extension에서 목표별 완료 결과를 제출할 수 있다.
- Web과 Extension이 동시에 결과를 제출해도 금융 원장과 세션 결과는 한 번만 확정된다.
- 서버 완료 상태를 확인한 Extension은 DNR, alarm, local active session을 정리한다.
- 네트워크 장애 시 목표 선택을 로컬 pending queue에 보존하고 서버 확인 전 포인트를 확정 표시하지 않는다.

학생 기록 화면과 guardian aggregate 연결은 이 canonical 수명주기가 안정화된 다음 단계에서 구현한다. 이번 범위에서는 기록 페이지 UI를 변경하지 않는다.

## 2. 상태 소유권과 상태 머신

Supabase `cloud_focus_sessions.payload.status`가 canonical 상태다.

```text
active
  ├─ pause ───────────────→ paused
  │                          └─ resume ─→ active
  ├─ target time reached ─→ awaiting-result
  ├─ abandon ─────────────→ failed
  └─ finish after target ─→ success | failed
```

terminal 상태는 `success`, `failed`, `cancelled`다. terminal 상태에서 상태나 정산 결과를 다시 변경하지 않는다.

Extension의 `chrome.storage.local`은 실행 복구용 cache다. 서버와 충돌하면 다음 우선순위를 사용한다.

1. 서버 terminal 상태
2. 서버 paused 또는 awaiting-result 상태
3. 서버 active 상태와 서버가 계산한 시간
4. 서버에 연결할 수 없을 때만 마지막 local snapshot

local snapshot을 근거로 서버 terminal 결과나 포인트를 새로 만들지 않는다.

## 3. Canonical 세션 데이터 계약

기존 필드를 삭제하지 않고 다음 필드를 additive하게 사용한다.

```ts
interface FocusSettlementResult {
  completedGoalIds: string[];
  goalResults: Array<{ goalId: string; completed: boolean }>;
  completedGoalCount: number;
  totalGoalCount: number;
  completionPercent: 0 | 60 | 80 | 100;
  earnedPoints: number;
  returnedPoints: number;
  settledAt: string;
}

interface CanonicalFocusSession {
  // 기존 필드 유지
  activeSegmentStartedAt: string | null;
  pausedAt: string | null;
  accumulatedFocusSeconds: number;
  remainingFocusSeconds: number;
  result: FocusSettlementResult | null;
  updatedAt: string;
}
```

`start_focus_session()`은 다음 초기값을 저장한다.

```text
activeSegmentStartedAt = startedAt
pausedAt = null
accumulatedFocusSeconds = 0
remainingFocusSeconds = targetFocusMinutes × 60
result = null
updatedAt = startedAt
```

`endsAt`은 active 상태에서 현재 segment의 예상 종료 시각이다. paused 상태에서는 마지막 active segment의 종료 시각을 권한 판단에 사용하지 않으며 `remainingFocusSeconds`가 재개 기준이다.

기존 배포 세션에 새 필드가 없으면 서버가 `startedAt`, `endsAt`, `targetFocusMinutes`, `status`로 보수적으로 보정한다. terminal 세션의 기존 결과는 변경하지 않는다.

공유 Zod schema는 기존 payload도 읽을 수 있도록 새 필드에 호환 기본값을 제공하되, 신규 RPC 응답은 모든 필드를 명시한다.

## 4. 서버 RPC

### 4.1 현재 세션 복구

```sql
get_current_focus_session() returns jsonb
get_focus_session(p_session_id text) returns jsonb
```

인증 사용자의 삭제되지 않은 `active`, `paused`, `awaiting-result` 세션을 최대 한 개 반환한다. 없으면 `null`을 반환한다.

`get_focus_session()`은 Web 또는 Extension이 이미 알고 있는 session ID의 own-user payload를 terminal 상태까지 반환한다. 다른 사용자의 세션과 삭제된 세션은 반환하지 않는다. Extension이 Web에서 먼저 완료된 세션의 확정 결과를 받아 local state를 정리할 때 사용한다.

조회 transaction에서 active 세션의 `endsAt <= now()`이면 다음을 원자적으로 적용한 뒤 `awaiting-result`로 반환한다.

```text
status = awaiting-result
accumulatedFocusSeconds = targetFocusMinutes × 60
remainingFocusSeconds = 0
activeSegmentStartedAt = null
pausedAt = now
updatedAt = now
```

이 정규화는 Extension alarm이 누락됐거나 Web이 종료된 경우에도 서버 상태를 수렴시키기 위한 것이다.

### 4.2 일시정지

```sql
pause_focus_session(p_session_id text, p_device_id text) returns jsonb
```

서버는 인증, 소유권, active 상태를 확인하고 advisory lock과 row lock을 획득한다. 현재 active segment의 경과 시간을 기존 누적 시간에 더하되 목표 시간을 넘지 않게 제한한다.

```text
accumulatedFocusSeconds += now - activeSegmentStartedAt
remainingFocusSeconds = targetSeconds - accumulatedFocusSeconds
status = paused
activeSegmentStartedAt = null
pausedAt = now
updatedAt = now
```

이미 목표 시간이 끝났다면 paused가 아니라 `awaiting-result`로 전환한다. 같은 세션이 이미 paused이면 현재 payload를 반환한다.

### 4.3 재개

```sql
resume_focus_session(p_session_id text, p_device_id text) returns jsonb
```

서버는 paused 상태만 재개한다.

```text
status = active
activeSegmentStartedAt = now
pausedAt = null
endsAt = now + remainingFocusSeconds
updatedAt = now
```

남은 시간이 0이면 active로 되돌리지 않고 `awaiting-result`를 반환한다. 이미 active인 동일 세션에 대한 재호출은 현재 payload를 반환한다.

### 4.4 결과 정산

기존 함수를 유지한다.

```sql
finish_focus_session(
  p_session_id text,
  p_completed_goal_ids text[],
  p_device_id text
) returns jsonb
```

기존 목표 검증과 self deposit 분할 정산을 유지하며 다음을 강화한다.

- terminal 상태면 최초 확정 payload를 그대로 반환한다.
- 완료 목표가 한 개 이상이면 목표 시간이 모두 누적됐거나 상태가 `awaiting-result`인지 확인한다.
- 빈 배열 조기 포기는 기존 정책대로 0% failed 처리한다.
- terminal update 시 `activeSegmentStartedAt`, `pausedAt`을 null로 만들고 실제 누적 시간을 고정한다.
- 동일 세션의 원장 idempotency key를 유지한다.

Web과 Extension이 서로 다른 목표 목록을 동시에 제출하면 row lock을 먼저 획득한 요청의 결과가 확정된다. 이후 요청은 자신의 입력과 무관하게 확정된 결과를 받는다.

### 4.5 권한

모든 RPC는 `auth.uid()`를 다시 확인하는 `security definer` 함수로 구현한다. `public`, `anon` 실행 권한은 제거하고 `authenticated`에만 필요한 signature를 부여한다. 클라이언트가 user ID, 포인트, 완료율을 지정하지 못하게 한다.

## 5. Web 흐름

`FocusPlanner`에서 Supabase 호출과 상태 복구를 분리한다.

```text
focus-planner.tsx
  ↓
canonical-focus-service.ts
  ├─ getCurrentSession()
  ├─ pauseSession()
  ├─ resumeSession()
  └─ finishSession()
```

페이지 mount 시 `getCurrentSession()`을 호출한다.

- active: 서버 `endsAt` 기준 timer를 복구한다.
- paused: 남은 시간을 고정하고 재개 action을 표시한다.
- awaiting-result: 서버 snapshot의 목표 체크리스트를 표시한다.
- current session 없음: 계획 작성 상태를 표시한다.

복구 중에는 새 계획 시작 버튼을 비활성화한다. 진행 세션이 있는 동안 새 계획 submit도 비활성화해 기존 active UI state가 error 상태로 바뀌는 문제를 막는다.

pause/resume 버튼은 서버 RPC가 성공한 뒤 반환 payload로 UI를 갱신한다. 클라이언트가 자체적으로 `endsAt`을 연장하지 않는다.

완료 성공 후 서버 결과를 표시하고 Extension에 `mirujima:focus-reconcile-request`를 보낸다. 메시지가 실패해도 Extension의 주기 reconciliation이 같은 terminal 상태를 확인한다.

## 6. Extension 흐름

### 6.1 Reconciliation

기존 `activateCanonicalFocus()`의 active 전용 강제 refresh를 상태별 `reconcileCanonicalFocus()`로 교체한다. local canonical session ID가 있으면 `get_focus_session()`으로 해당 세션의 terminal 상태까지 확인하고, local session이 없을 때는 `get_current_focus_session()`으로 복구 대상을 찾는다.

- active: local snapshot 갱신, DNR 적용, focus end alarm 설정
- paused: DNR과 focus alarm 해제, local paused snapshot 저장
- awaiting-result: DNR과 alarm 해제, 목표 체크리스트를 표시할 local snapshot 저장
- terminal: DNR과 관련 alarm 해제, 서버 결과를 local history에 한 번 반영, active session 제거
- 알려진 session ID도 찾을 수 없음: canonical local active가 있다면 안전하게 enforcement를 정리하되 금융 결과를 만들지 않음

1분 alarm은 local 상태를 active로 가정하지 않는다. local canonical session ID가 있으면 `get_focus_session()`을, 없으면 `get_current_focus_session()`을 호출해 상태를 reconciliation한다. Web의 즉시 메시지도 같은 함수를 사용한다.

### 6.2 목표 완료 UI

canonical session의 `goals`와 `result`를 Extension local `FocusSession`에 additive하게 저장한다. Popup, Side Panel, App이 공유하는 기존 Focus UI에 awaiting-result 목표 체크리스트를 추가한다.

예상 완료율은 공유 순수 함수로 계산해 안내만 제공한다. 실제 완료율과 포인트는 서버 응답만 확정 표시한다. 일반 local-only 세션의 기존 완료/미완료 동작은 유지한다.

### 6.3 Pending settlement queue

canonical 정산이 네트워크 오류로 실패하면 다음 최소 정보만 `chrome.storage.local`에 저장한다.

```ts
interface PendingCanonicalSettlement {
  sessionId: string;
  completedGoalIds: string[];
  deviceId: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
}
```

활성 canonical 세션은 사용자당 하나이므로 session ID별 한 항목으로 중복을 합친다. 목표 선택은 서버가 아직 terminal이 아닐 때만 사용한다. 서버가 이미 terminal이면 queue 입력을 버리고 서버 결과로 수렴한다.

재시도 시점은 다음과 같다.

- Extension bootstrap
- canonical 1분 reconciliation alarm
- Extension 인증 복원
- 사용자의 명시적 재시도

재시도 실패는 포인트 성공으로 표시하지 않는다. DNR은 목표 시간이 끝난 즉시 해제한 상태를 유지한다.

## 7. Web↔Extension 메시지 계약

공유 message union에 다음 요청을 additive하게 추가한다.

```ts
{
  type: "mirujima:focus-reconcile-request";
  version: 1;
  requestId: string;
  scheduleId: string;
  sessionId: string;
}
```

Extension은 기존과 동일하게 exact sender origin, schema version, 로그인 사용자와 canonical 소유권을 확인한다. 메시지는 상태 변경 권한이 아니라 즉시 서버 재조회 trigger로만 사용한다.

포인트, 완료율, provider key는 external message에 넣지 않는다.

## 8. 오류와 사용자 메시지

원시 Supabase 오류는 사용자에게 노출하지 않는다.

- 복구 실패: `진행 중인 집중 세션을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.`
- pause/resume 실패: 기존 서버 상태를 유지하고 재시도 action 제공
- 정산 네트워크 실패: `선택한 목표를 안전하게 보관했습니다. 연결되면 다시 정산합니다.`
- 계정 불일치: Extension 로그인 계정 확인 안내, 서버/local 데이터를 합치지 않음
- 서버 terminal 확인: 최초 확정 결과를 표시하고 다른 client의 선택이 이미 반영됐음을 안내
- 알려진 server session 없음/local canonical 존재: 차단은 정리하고 `서버 세션을 확인할 수 없어 포인트는 변경하지 않았습니다.` 표시

## 9. 호환성과 migration

새 테이블을 만들지 않는다. 기존 `cloud_focus_sessions.payload`와 Extension storage schema만 확장한다.

- 기존 local-only Extension 세션은 기존 상태 머신과 완료 UI를 유지한다.
- 기존 canonical active session은 새 필드가 없어도 server normalization으로 복구한다.
- 기존 terminal session과 ledger row는 수정하지 않는다.
- 기존 `finish_focus_session(text, integer, text)` legacy overload는 목표 없는 과거 세션 호환을 위해 유지한다.
- storage schema version을 올리고 pending settlement 기본값을 빈 배열로 migration한다.

배포 순서는 migration → contracts/Web/Extension 배포 순서다. 신규 클라이언트가 이전 RPC 환경에서 실행되는 동안은 기능별 오류 메시지를 표시하고 로컬 금융 확정을 만들지 않는다.

## 10. 테스트와 완료 기준

### 10.1 공유 계약

- 신규 canonical 필드와 기존 payload 호환 parsing
- settlement result validation
- 0/60/80/100 예상 완료율 경계값
- reconcile external message validation

### 10.2 데이터베이스 pgTAP

- current session own-user 조회와 타 사용자 격리
- 종료 시각이 지난 active 세션의 awaiting-result 정규화
- pause 시 누적/남은 시간 계산과 멱등 재호출
- resume 시 새로운 endsAt 계산과 멱등 재호출
- remaining 0 세션의 awaiting-result 유지
- terminal 세션 정산 재호출 불변성
- Web/Extension 순차 경쟁을 모사한 서로 다른 goal IDs 재호출
- self deposit 원장 row 중복 없음
- 기존 field가 없는 active payload 호환

### 10.3 Web Vitest

- mount active/paused/awaiting-result 복구
- 복구 중 및 진행 중 새 계획 submit 차단
- pause/resume 성공과 실패 상태 유지
- 목표 체크 상태를 finish RPC에 전달
- 완료 후 reconcile message 전송 실패가 정산 결과를 되돌리지 않음

### 10.4 Extension Vitest

- active/paused/awaiting-result/terminal reconciliation
- paused/awaiting-result에서 DNR 재활성화 방지
- terminal cleanup과 local history 중복 방지
- pending settlement 저장, 재시도, terminal server result 수렴
- 계정 불일치와 current 없음 안전 정리
- local-only session 기존 완료 흐름 회귀

### 10.5 전체 검증

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run typecheck --workspace @mirujima/web
npm test --workspace @mirujima/web
npm run lint --workspace @mirujima/web
npm run build --workspace @mirujima/web
npm run typecheck --workspace @mirujima/contracts
npm test --workspace @mirujima/contracts
```

Root lint를 막는 기존 미사용 import 9개는 기능 변경 없이 제거한다. Supabase가 실행 가능한 환경에서는 신규 pgTAP 파일을 포함한 database test도 통과해야 한다.

수동 완료 기준은 다음과 같다.

1. Web 새로고침 후 동일 세션과 남은 시간 복구
2. Extension pause가 1분 뒤에도 유지
3. Web을 닫은 상태에서 Extension 목표별 60/80/100 정산
4. Web과 Extension의 서로 다른 동시 제출이 최초 결과 하나로 수렴
5. terminal 확인 후 DNR, alarm, active session 제거
6. offline 결과 선택 후 reconnect 자동 정산
7. 정산 뒤 다음 집중 세션 정상 시작

## 11. 범위 제외

이번 첫 구현 단위에는 다음을 포함하지 않는다.

- 학생 `/history`, `/home`, `/my` aggregate 연결
- 보호자 기록과 동의 aggregate UI
- guardian reward 요청·승인·지급
- Web 알림 센터와 Push
- 공유 설정 저장과 가족 연결 해제
- 목표별 자동 증빙 또는 활동 기반 자동 완료 판정
- Realtime subscription 도입
- 신규 데이터베이스 table

위 기능은 canonical terminal 결과가 안정적으로 생성된 다음 승인된 우선순서대로 별도 설계·구현한다.
