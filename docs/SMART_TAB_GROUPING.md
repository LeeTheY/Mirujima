# 미루지마 스마트 탭 자동 그룹화 추가 기능 명세

> 이 문서는 기존 `AGENTS.md`를 수정하지 않고 미루지마에 스마트 탭 자동 그룹화 기능을 추가하기 위한 독립 실행 명세다.
> 구현 시 기존 `AGENTS.md`, 현재 코드, 기존 테스트를 먼저 확인하고 현재 집중·휴식·차단·저장소 정책을 보존하면서 확장한다.
>
> 문서 버전: `1.0`
> 작성 기준일: `2026-07-15`
> 구현 상태: 기획 확정, 구현 전

---

## 0. Codex 실행 요청

현재 미루지마 Chrome Extension에 사용자의 일정, 집중·휴식 상태, 저장된 분류 규칙을 바탕으로 관련도 높은 탭끼리 Chrome 탭 그룹으로 정리하는 기능을 추가한다.

필수 결과:

- 집중 시작 또는 재개 시 현재 활성 창의 탭 자동 분류
- 사용자가 원할 때 실행하는 수동 탭 정리
- 현재 작업, 참고 자료, 커뮤니케이션, 휴식, 분류 필요 그룹
- 일정의 허용 사이트와 작업 세트를 최우선으로 반영
- 휴식 중 열린 Netflix 등 비작업 탭을 집중 재개 시 휴식 그룹으로 이동
- YouTube·Netflix처럼 상황에 따라 용도가 달라지는 사이트의 일정별 예외
- 사용자가 만든 기존 그룹과 고정 탭 보존
- 사용자가 수정한 분류를 이번 세션 또는 이후 일정에 기억
- 집중 종료 시 정리 전 탭 레이아웃 복원 선택
- 기존 DNR 사이트 차단과 독립적으로 동작하면서 상태를 공유
- 분류 순수 함수, Chrome API wrapper, storage repository, 회귀 테스트

초기 버전은 외부 AI API 없이 로컬 규칙과 점수로 동작해야 한다. 탭 분류를 위해 페이지 본문, 검색어, 입력값을 읽거나 외부 서버로 전송하지 않는다.

---

## 1. 기존 명세와의 관계

- 기존 `AGENTS.md`는 수정하지 않는다.
- 현재 Chrome Manifest V3, React, TypeScript strict, Vite, Vitest 구조를 유지한다.
- 기존 일정, 집중 상태 머신, 휴식 누적 시간, DNR 차단, 알림, 리포트 동작을 깨뜨리지 않는다.
- UI 컴포넌트에서 `chrome.tabs`, `chrome.tabGroups`, `chrome.storage`를 직접 호출하지 않는다.
- Background Service Worker가 탭 조회·분류 조율·그룹 적용·복구를 담당한다.
- 분류 계산은 Chrome API와 분리된 순수 함수로 작성한다.
- 기존 저장 데이터가 있다면 migration 없이 삭제하거나 덮어쓰지 않는다.
- 탭 그룹화는 사이트 차단을 대신하지 않는다. 그룹화와 DNR 차단은 별도 책임으로 유지한다.
- 기존 `AGENTS.md` 섹션 29 이후의 v2 UI·오류 UX·검증 기준을 모두 따른다.

---

## 2. 기능 목표와 비목표

### 2.1 목표

- 집중 시작 전에 흩어진 탭을 현재 목적에 맞게 정리한다.
- 작업과 관계없는 탭을 닫지 않고 안전하게 휴식 그룹에 보관한다.
- 비슷한 작업·자료 탭을 같은 그룹으로 묶는다.
- 일정에 필요한 사이트는 일반적인 방해 사이트 분류보다 우선한다.
- 불확실한 탭은 억지로 분류하지 않는다.
- 사용자가 자동화 결과를 이해하고 수정할 수 있게 한다.
- 같은 작업을 다시 시작할 때 사용자의 선택을 재사용한다.
- 자동 정리 전 상태를 가능한 범위에서 복원한다.

### 2.2 비목표

- 탭 그룹만으로 사이트 접근을 차단하지 않는다.
- 사용자의 탭을 자동으로 닫지 않는다.
- Chrome 밖의 앱이나 다른 브라우저를 정리하지 않는다.
- 페이지 본문, 검색어, 폼 값으로 탭을 분류하지 않는다.
- AI API가 없으면 사용할 수 없는 기능으로 만들지 않는다.
- 첫 버전에서 모든 Chrome 창과 시크릿 창을 자동으로 변경하지 않는다.
- 자동 분류 결과를 절대적으로 정확하다고 표현하지 않는다.

---

## 3. 탭 그룹 모델

```ts
export type TabCategory =
  | "work"
  | "reference"
  | "communication"
  | "break"
  | "unclassified";
```

### 3.1 현재 작업

표시명:

```text
🎯 현재 작업
```

포함 대상:

- 현재 일정의 `allowedDomains`와 일치하는 탭
- 현재 일정에 연결된 작업 탭 세트
- 현재 프로젝트 저장소, localhost, 배포·디자인 작업 페이지
- 일정별 사용자 규칙에서 작업으로 지정한 탭

기본 설정:

- 색상: `blue`
- 집중 시작·재개 시 펼침
- 분류 완료 후 우선 활성화 후보

일정별 세부 그룹을 사용하는 경우 `🎯 {일정명}`으로 표시할 수 있다.

### 3.2 참고 자료

표시명:

```text
📚 참고 자료
```

포함 대상:

- 공식 문서
- 기술 문서와 검색 결과
- 강의·학습 자료
- 현재 작업 탭에서 열린 참고 페이지
- 사용자가 참고 자료로 지정한 탭

기본 설정:

- 색상: `green`
- 집중 시작 시 펼침
- 현재 작업 다음 순서에 배치

### 3.3 커뮤니케이션

표시명:

```text
💬 커뮤니케이션
```

포함 대상:

- Gmail
- Slack
- Discord
- Google Chat
- Jira·Linear 등 협업 도구
- 사용자가 커뮤니케이션으로 지정한 탭

기본 설정:

- 색상: `purple`
- 자동 접기 여부는 사용자 설정
- 일정에서 필수 사이트로 지정된 경우 현재 작업이 우선

Notion 등 문서와 협업에 모두 사용되는 서비스는 무조건 커뮤니케이션으로 고정하지 않는다.

### 3.4 휴식 탭

표시명:

```text
☕ 휴식 탭
```

포함 대상:

- 휴식 중 새로 열린 비작업 탭
- 일반적인 엔터테인먼트·커뮤니티·쇼핑 사이트
- 현재 일정의 `blockedDomains`와 일치하는 탭
- 사용자가 휴식으로 지정한 탭

기본 설정:

- 색상: `orange`
- 집중 시작·재개 시 자동 접기
- 탭을 닫지 않음
- 기존 DNR 정책에 따라 집중 중 접근은 별도로 차단 가능
- 휴식 시작 시 설정에 따라 펼치기
- 휴식 시작 시 특정 탭을 자동 활성화하는 기능은 기본값 `off`

### 3.5 분류 필요

표시명:

```text
📦 분류 필요
```

포함 대상:

- 최고 분류 점수가 기준보다 낮은 탭
- 1위와 2위 점수 차이가 작은 탭
- 신규·모호한 도메인
- 제목이나 URL을 읽을 권한이 부족한 일반 탭

기본 설정:

- 색상: `grey`
- 자동으로 접지 않음
- 사용자가 직접 분류하는 UI 제공

Chrome 내부 페이지와 확장 프로그램 제한 페이지는 가능하면 그룹에 강제 포함하지 않고 `excluded`로 처리한다.

---

## 4. 핵심 사용자 흐름

### 4.1 집중 시작

```text
FOCUS_START 요청
→ 일정과 현재 집중 상태 검증
→ 현재 활성 일반 창 확인
→ 정리 전 탭·그룹 snapshot 생성
→ 제어 가능한 탭 조회
→ 일정·작업 세트·사용자 규칙 조회
→ 탭별 분류 점수와 근거 계산
→ 기존 사용자 그룹 보존 정책 적용
→ 미루지마 그룹 생성 또는 재사용
→ 탭 이동
→ 휴식 그룹 접기
→ 작업·참고 그룹 펼치기
→ 작업 탭 활성화
→ 기존 FOCUS_START와 DNR 적용 계속 진행
→ 결과 요약 저장·표시
```

탭 정리 일부가 실패해도 집중 세션 시작 전체를 실패시키지 않는다. 실패한 탭은 결과에 포함하고 기존 집중 기능은 계속 진행한다.

### 4.2 집중 중 수동 정리

```text
사용자가 탭 자동 정리 선택
→ 현재 창 탭 재조회
→ 기존 미루지마 그룹 확인
→ 사용자가 직접 이동한 탭 보호
→ 신규·미분류 탭 중심 재분류
→ 필요한 그룹만 갱신
→ 그룹별 개수와 제외·실패 결과 표시
```

기본 수동 정리는 사용자 그룹을 해제하지 않는다. `전체 다시 분류`는 별도 고급 동작과 확인 절차로 제공한다.

### 4.3 휴식 시작

기존 휴식 정책과 연결한다.

```text
사용자가 휴식 시작
→ 집중 타이머와 차단 일시정지
→ 휴식 시작 시각 기록
→ 휴식 그룹이 있으면 설정에 따라 펼침
→ 새로 열린 탭에 openedDuringMode = break 기록
```

휴식 그룹을 펼치는 것만으로 Netflix나 YouTube 탭을 자동 활성화하지 않는다. 사용자가 `마지막 휴식 탭 자동 열기`를 명시적으로 켠 경우에만 활성화한다.

### 4.4 휴식 후 집중 재개

```text
FOCUS_RESUME 요청
→ 휴식 중 생성·변경된 탭 확인
→ 현재 일정 허용 사이트 우선 적용
→ 비작업 탭을 휴식 그룹으로 이동
→ 휴식 그룹 접기
→ 마지막 작업 탭 또는 첫 작업 탭 활성화
→ 기존 집중 타이머와 DNR 재개
```

### 4.5 Netflix 예시

```text
휴식 중 Netflix 탭 생성
→ openedDuringMode = break

집중 재개
→ 현재 일정 allowedDomains 확인
→ netflix.com이 허용되지 않았다면 break 점수 부여
→ ☕ 휴식 탭으로 이동
→ 휴식 그룹 접기
→ 작업 탭 활성화
→ 기존 차단 모드가 Netflix를 차단하면 DNR 적용
```

Netflix 탭은 닫지 않는다.

예외:

```text
일정: 영어 드라마 분석
allowedDomains: netflix.com

결과:
Netflix → 🎯 현재 작업
```

### 4.6 집중 종료

종료 확인 후 다음 선택지를 제공한다.

- 정리 전 탭 배치 복원
- 현재 그룹 유지
- 현재 작업 탭을 작업 세트로 저장

기본값은 사용자 설정을 따르며, 데이터 유실 위험이 있으면 매번 묻는다.

복원 원칙:

- 집중 중 사용자가 닫은 탭은 자동으로 다시 열지 않음
- 집중 중 새로 연 탭은 자동으로 닫지 않음
- 존재하는 탭의 순서·고정 상태·기존 그룹을 가능한 범위에서 복원
- tab ID가 유효하지 않으면 URL과 snapshot metadata를 fallback으로 사용하되 자동 재오픈은 사용자 설정이 있을 때만 수행
- 일부 복원 실패가 전체 종료를 실패시키지 않음

---

## 5. 분류 우선순위

반드시 다음 순서로 적용한다.

```text
1. 현재 일정의 allowedDomains
2. 현재 일정에 연결된 작업 탭 세트
3. 일정별 사용자 분류 규칙
4. 전역 사용자 분류 규칙
5. 사용자가 방금 직접 이동한 탭 보호
6. 이전 분류 수정 기록
7. 현재 일정의 blockedDomains
8. 탭이 열린 당시 모드(focus, break, idle)
9. 기본 도메인 카테고리
10. 제목·URL의 제한된 키워드
11. opener 관계와 같은 프로젝트 관련도
12. 확신이 부족하면 분류 필요
```

상위 규칙과 하위 규칙이 충돌하면 상위 규칙을 적용한다.

예시:

- YouTube가 일반적으로 휴식 후보여도 현재 일정 허용 사이트면 작업 또는 참고
- 휴식 중 GitHub를 열었어도 현재 일정 저장소라면 작업
- Gmail이 커뮤니케이션 기본 규칙이어도 현재 일정에서 허용되지 않았다면 일정 정책에 따라 휴식 또는 분류 필요

---

## 6. 분류 입력 데이터와 개인정보

### 6.1 탭 입력

```ts
export interface TabContext {
  tabId: number;
  windowId: number;
  index: number;
  title: string | null;
  url: string | null;
  hostname: string | null;
  pinned: boolean;
  active: boolean;
  openerTabId?: number;
  currentGroupId: number;
  openedAt?: string;
  openedDuringMode?: "focus" | "break" | "idle";
}
```

### 6.2 일정 입력

현재 프로젝트의 `Schedule`과 `DomainRule`을 재사용한다.

```ts
export interface TabClassificationContext {
  scheduleId: string;
  scheduleTitle: string;
  scheduleDescription: string;
  activityMode: ActivityMode;
  blockingMode: BlockingMode;
  allowedDomains: DomainRule[];
  blockedDomains: DomainRule[];
  taskKeywords: string[];
  workTabSetId?: string;
}
```

### 6.3 수집하지 않는 데이터

- 페이지 본문
- 검색어
- 폼 입력값
- 키보드 입력값
- 클릭 대상 텍스트
- 쿠키
- 전체 브라우징 기록

제목과 URL은 현재 열린 탭을 분류하는 동안만 사용한다. 사용자 규칙에는 가능한 한 정규화된 hostname과 사용자가 선택한 제한된 키워드만 저장한다.

작업 탭 세트에 전체 URL을 저장할 때는 사용자가 직접 저장을 선택해야 하며 저장 목적과 삭제 방법을 표시한다.

---

## 7. 규칙 기반 점수 모델

```ts
export interface ClassificationScores {
  work: number;
  reference: number;
  communication: number;
  break: number;
}

export interface ClassificationReason {
  code: string;
  label: string;
  scoreDelta: number;
}

export interface TabClassification {
  tabId: number;
  category: TabCategory;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: ClassificationReason[];
}
```

초기 권장 점수:

| 조건 | 결과 |
|---|---:|
| 일정 allowedDomain 일치 | 작업 +100 |
| 일정 작업 세트 URL·도메인 일치 | 작업 +90 |
| 일정별 사용자 규칙 | 지정 카테고리 +85 |
| 전역 사용자 규칙 | 지정 카테고리 +75 |
| 직전 사용자 수동 이동 | 현재 카테고리 고정 |
| 일정 blockedDomain 일치 | 휴식 +100 |
| 휴식 중 생성 | 휴식 +40 |
| 공식 문서 규칙 | 참고 +45 |
| 메일·메신저 규칙 | 커뮤니케이션 +50 |
| 엔터테인먼트 규칙 | 휴식 +50 |
| 일정 키워드가 title·path에 일치 | 작업 또는 참고 +30~50 |
| 작업 탭에서 열린 하위 탭 | 작업 또는 참고 +25 |

초기 판정 기준:

```ts
export const MIN_CLASSIFICATION_SCORE = 40;
export const MIN_SCORE_GAP = 15;
```

- 최고 점수가 기준 미만이면 `unclassified`
- 최고 점수와 두 번째 점수 차이가 기준 미만이면 `unclassified`
- 사용자 고정 규칙과 일정 allow/block 규칙은 일반 점수보다 우선하는 명시적 결정으로 처리 가능
- 점수와 근거는 사용자 결과 UI와 테스트에서 확인할 수 있게 유지

---

## 8. 도메인 규칙

### 8.1 기본 규칙 예시

```ts
export const DEFAULT_TAB_DOMAIN_CATEGORIES = {
  work: ["github.com", "gitlab.com", "vercel.com", "localhost", "figma.com"],
  reference: [
    "developer.mozilla.org",
    "react.dev",
    "stackoverflow.com",
    "wikipedia.org",
  ],
  communication: [
    "mail.google.com",
    "slack.com",
    "discord.com",
    "linear.app",
  ],
  break: ["instagram.com", "twitch.tv", "netflix.com"],
} as const;
```

실제 구현에서는 기존 `site-presets.ts`와 중복된 서비스명·hostname을 별도 파일에 다시 하드코딩하지 않는다. 공용 도메인 메타데이터 또는 명시적인 adapter를 사용한다.

### 8.2 상황 의존 도메인

```ts
export const CONTEXT_SENSITIVE_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "netflix.com",
  "notion.so",
] as const;
```

상황 의존 도메인은 일반 카테고리만으로 high confidence를 주지 않는다.

### 8.3 hostname 일치

- 기존 도메인 정규화 유틸 재사용
- `www.` 정책 유지
- `DomainRule.includeSubdomains` 반영
- protocol, query, hash를 점수 규칙 key로 사용하지 않음
- localhost는 port를 별도 프로젝트 단서로 사용할 수 있지만 hostname 규칙과 분리

---

## 9. 관련도 높은 세부 그룹

MVP는 기본 5개 그룹으로 시작한다. 탭이 많고 관련도를 충분히 설명할 수 있을 때만 세부 그룹을 생성한다.

예시:

```text
🎯 React 프로젝트
🎯 포트폴리오 배포
📚 React 문서
📚 검색·참고
💬 커뮤니케이션
☕ 휴식 탭
```

세부 그룹 단서:

- 같은 GitHub owner/repository
- 같은 localhost port
- 같은 저장 작업 세트
- 동일 문서 서비스와 공통 path prefix
- 같은 openerTabId 계열
- 일정 제목·작업 키워드 일치

안전 규칙:

- 최소 2개 탭이 있을 때만 세부 그룹 생성
- 그룹 수 상한 설정
- 한 개 탭만 남은 세부 그룹은 기본 카테고리 그룹으로 병합 가능
- 제목은 사용자가 이해할 수 있는 짧은 문구
- query나 민감한 URL fragment를 그룹 제목에 포함하지 않음
- 관련도를 설명할 수 없으면 기본 그룹 유지

---

## 10. 탭과 그룹 snapshot

```ts
export interface FocusTabSnapshot {
  id: string;
  sessionId: string;
  windowId: number;
  createdAt: string;
  activeTabId?: number;
  tabs: FocusTabSnapshotItem[];
  groups: FocusTabSnapshotGroup[];
}

export interface FocusTabSnapshotItem {
  tabId: number;
  index: number;
  pinned: boolean;
  groupId: number;
  url?: string;
  title?: string;
  active: boolean;
}

export interface FocusTabSnapshotGroup {
  groupId: number;
  title?: string;
  color: chrome.tabGroups.Color;
  collapsed: boolean;
}
```

원칙:

- tab ID와 group ID는 브라우저 세션을 넘어서 영구 식별자로 취급하지 않음
- URL fallback은 사용자가 복원 기능을 켠 경우에만 제한적으로 저장
- 진행 중 세션 snapshot은 Service Worker 재시작 후에도 사용 가능하게 로컬 저장
- 완료된 snapshot은 기본 7일 후 정리
- 사용자 그룹과 미루지마 그룹을 구분하는 metadata 저장
- snapshot 저장 실패 시 자동 그룹화를 중단하거나 복원 불가 경고를 먼저 표시

---

## 11. 사용자 분류 규칙

```ts
export interface UserTabClassificationRule {
  id: string;
  hostname: string;
  category: TabCategory;
  scope: "global" | "schedule";
  scheduleId?: string;
  titleKeyword?: string;
  createdAt: string;
  updatedAt: string;
}
```

우선순위:

```text
일정별 규칙 > 전역 규칙 > 기본 도메인 규칙
```

수정 UI:

```text
YouTube 탭
현재 분류: ☕ 휴식 탭
분류 근거: 휴식 중 열림, 엔터테인먼트 후보

[현재 작업]
[참고 자료]
[커뮤니케이션]
[휴식 탭]

○ 이번에만 적용
○ 이 일정에서 기억
○ 항상 기억
```

사용자가 탭을 직접 Chrome 그룹으로 드래그한 경우 일정 시간 자동 재분류하지 않는다.

---

## 12. 작업 탭 세트

```ts
export interface WorkTabSet {
  id: string;
  name: string;
  scheduleId?: string;
  items: WorkTabSetItem[];
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface WorkTabSetItem {
  id: string;
  url: string;
  hostname: string;
  category: Exclude<TabCategory, "unclassified">;
  order: number;
}
```

기능:

- 현재 작업 탭을 세트로 저장
- 일정에 기본 작업 세트 연결
- 저장된 세트를 한 번에 열기
- URL 중복 제거
- 사용자가 직접 삭제·수정
- 일정 시작 시 현재 열린 탭과 세트 매칭

Premium 클라우드 동기화가 별도 구현되면 사용자가 명시적으로 저장한 작업 세트만 동기화한다. 해당 기능이 없으면 로컬 전용으로 동작한다.

---

## 13. 실시간 새 탭 분류

선택 설정으로만 제공한다.

```text
집중 진행 중
→ chrome.tabs.onCreated 또는 onUpdated
→ URL이 확정될 때까지 대기
→ 현재 일정과 분류 규칙 조회
→ high confidence면 해당 미루지마 그룹으로 이동
→ low confidence면 이동하지 않거나 분류 필요에 표시
→ 기존 DNR 정책은 별도 적용
```

필수 안전장치:

- `about:blank` 상태에서 분류하지 않음
- loading 중 반복 처리 debounce
- 처리 중 tab ID set으로 중복 방지
- 사용자 수동 이동 직후 cooldown
- Chrome drag 중 오류 재시도는 짧고 제한적으로 수행
- 세션이 paused, awaiting-result, completed면 실시간 분류 중단
- 휴식 중 새 탭은 생성 시점만 기록하고 즉시 강제로 그룹 이동하지 않아도 됨

---

## 14. Chrome API와 권한

사용 후보:

- `chrome.tabs.query`
- `chrome.tabs.get`
- `chrome.tabs.group`
- `chrome.tabs.ungroup`
- `chrome.tabs.move`
- `chrome.tabs.update`
- `chrome.tabs.onCreated`
- `chrome.tabs.onUpdated`
- `chrome.tabs.onActivated`
- `chrome.tabGroups.query`
- `chrome.tabGroups.get`
- `chrome.tabGroups.update`
- `chrome.storage.local`
- 필요 시 `chrome.storage.session`

권한 후보:

- `tabs`
- `tabGroups`
- `storage`

원칙:

- 현재 manifest를 먼저 확인하고 실제로 없는 권한만 추가
- URL·title 접근을 위해 `tabs` 또는 기존 host permission 사용 범위 검토
- 기존 `<all_urls>`와 DNR 권한을 탭 그룹화 때문에 중복 추가하지 않음
- 새 권한 이유를 README와 PRIVACY에 작성
- Content Script에서 탭 그룹을 조작하지 않음
- Chrome API wrapper를 통해 테스트에서 mock 가능하게 함

---

## 15. Background 책임과 권장 구조

현재 프로젝트 구조를 우선하고 이름을 억지로 변경하지 않는다.

```text
src/
├─ background/
│  ├─ tab-organizer.ts
│  ├─ tab-grouping.ts
│  ├─ tab-events.ts
│  └─ tab-snapshot.ts
├─ features/
│  └─ tab-organizer/
│     ├─ classifier.ts
│     ├─ scoring.ts
│     ├─ domain-categories.ts
│     ├─ repository.ts
│     ├─ types.ts
│     └─ components/
└─ shared/
   └─ chrome/
      └─ tabs-api.ts
```

책임:

- `tab-organizer`: 전체 흐름 조율
- `classifier`: 입력 context를 카테고리로 판정하는 순수 로직
- `scoring`: 점수와 근거 계산
- `tab-grouping`: Chrome 그룹 생성·재사용·이동
- `tab-events`: 새 탭·활성 탭·사용자 이동 cooldown
- `tab-snapshot`: 정리 전 상태 저장·복원
- `repository`: 설정, 사용자 규칙, 작업 세트, snapshot 영속화

---

## 16. 메시지 통신

기존 `ExtensionMessage` discriminated union에 다음 요청을 추가한다.

```ts
export type TabOrganizerMessage =
  | {
      type: "TAB_ORGANIZE";
      mode: "smart" | "full";
    }
  | {
      type: "TAB_LAYOUT_RESTORE";
      sessionId: string;
    }
  | {
      type: "TAB_CLASSIFICATION_UPDATE";
      tabId: number;
      category: TabCategory;
      remember: "once" | "schedule" | "global";
    }
  | {
      type: "WORK_TAB_SET_SAVE";
      scheduleId?: string;
      name: string;
    };
```

- 기존 FOCUS_START·FOCUS_RESUME 요청을 중복 정의하지 않음
- 탭 정리 결과 응답 타입을 별도 정의
- 문자열 이벤트 이름을 UI와 Background에 중복 작성하지 않음
- runtime error를 사용자용 메시지로 변환

---

## 17. 결과 모델

```ts
export interface OrganizeTabsResult {
  success: boolean;
  windowId: number;
  trigger: "focus-start" | "focus-resume" | "manual" | "realtime";
  groups: Array<{
    category: TabCategory;
    title: string;
    groupId?: number;
    tabIds: number[];
  }>;
  excludedTabs: Array<{
    tabId: number;
    reason: string;
  }>;
  failedTabs: Array<{
    tabId: number;
    reason: string;
  }>;
  snapshotId?: string;
}
```

`success`는 일부 탭 실패가 있을 때도 정책에 따라 true일 수 있다. 부분 성공 여부를 별도 field로 표현하는 방안도 검토한다.

---

## 18. 설정

```ts
export interface TabOrganizerSettings {
  enabled: boolean;
  organizeOnFocusStart: boolean;
  organizeOnFocusResume: boolean;
  classifyNewTabsDuringFocus: boolean;
  rememberBreakOpenedTabs: boolean;
  collapseBreakGroupOnFocus: boolean;
  expandBreakGroupOnBreak: boolean;
  activateWorkTabAfterOrganize: boolean;
  activateLastBreakTabOnBreak: boolean;
  restoreLayoutOnFinish: "ask" | "always" | "never";
  preserveUserGroups: boolean;
  includePinnedTabs: boolean;
  rememberCorrections: boolean;
}
```

권장 기본값:

- 기능 전체: on
- 집중 시작 자동 정리: on
- 집중 재개 자동 정리: on
- 새 탭 실시간 분류: off
- 휴식 중 열린 탭 기록: on
- 집중 시 휴식 그룹 접기: on
- 휴식 시 휴식 그룹 펼치기: on
- 작업 탭 활성화: on
- 마지막 휴식 탭 자동 활성화: off
- 종료 시 복원: ask
- 기존 사용자 그룹 유지: on
- 고정 탭 포함: off
- 수정 기억: on

---

## 19. UI 요구사항

### 19.1 Focus 화면

주요 관리 화면으로 사용한다.

- 탭 자동 정리 사용 상태
- `지금 탭 정리`
- 현재 작업·참고·커뮤니케이션·휴식·분류 필요 개수
- 최근 정리 시각
- 분류 필요 탭 열기
- 정리 전 상태 복원
- 현재 작업 세트로 저장

### 19.2 Popup

Popup 380px 규격과 기존 집중 동작 우선순위를 유지한다.

- 활성 집중 중에만 축약형 `탭 정리` 버튼 표시 가능
- 그룹별 상세 목록과 분류 수정 UI는 넣지 않음
- 상세 관리는 Side Panel 또는 전체 페이지로 이동
- Popup의 Side Panel 열기 동작은 기존 확정 정책 유지

### 19.3 Settings

- 자동화 설정
- 기존 그룹 보존
- 고정 탭 처리
- 사용자 도메인 분류 규칙
- 작업 세트 관리 진입
- 저장된 분류 기록 초기화

### 19.4 결과 UI

```text
탭 정리가 완료됐어요.

🎯 현재 작업 4개
📚 참고 자료 6개
💬 커뮤니케이션 2개
☕ 휴식 탭 3개
📦 분류 필요 1개

[분류 확인]
[원래대로]
```

- 부분 실패가 있으면 성공 결과와 분리해 표시
- 오류 하나로 전체 앱 오류 화면을 표시하지 않음
- 사용자가 입력하거나 보던 현재 화면을 보존

---

## 20. 예외와 안전 규칙

반드시 처리한다.

- 탭이 하나뿐인 경우
- 작업 탭이 없는 경우
- 모든 탭이 작업 탭인 경우
- 모든 탭이 제외 대상인 경우
- 고정 탭
- 이미 존재하는 사용자 그룹
- 이미 존재하는 미루지마 그룹
- 그룹화 도중 탭이 닫힘
- 사용자가 탭을 드래그 중
- 탭이 다른 창으로 이동
- Chrome 창이 닫힘
- Service Worker 재시작
- Chrome 재시작으로 tab ID 변경
- `chrome://`, `chrome-extension://`, Chrome Web Store
- 시크릿 창
- URL·title 권한 부족
- 다른 확장 프로그램이 그룹 변경
- 같은 정리 요청 반복 클릭
- 집중 시작과 수동 정리 요청 동시 발생
- snapshot 저장 실패
- 레이아웃 복원 일부 실패

공통 규칙:

- 자동으로 탭을 닫지 않음
- 서로 다른 창의 탭을 한 그룹으로 묶지 않음
- 탭 하나의 오류로 전체 작업 중단 금지
- 중복 그룹 생성 방지
- 사용자 수동 행동 우선
- idempotent한 정리와 복구
- 자동 재시도 횟수 제한

---

## 21. 저장소와 migration

추가 후보 storage key:

```ts
export const TAB_ORGANIZER_STORAGE_KEYS = {
  settings: "mirujima:tab-organizer-settings",
  classificationRules: "mirujima:tab-classification-rules",
  workTabSets: "mirujima:work-tab-sets",
  activeSnapshot: "mirujima:active-tab-snapshot",
  recentSnapshots: "mirujima:recent-tab-snapshots",
  runtimeMetadata: "mirujima:tab-runtime-metadata",
} as const;
```

- 실제 프로젝트의 중앙 `STORAGE_KEYS`에 통합
- schema version 증가
- 기존 사용자에게 기본 설정 migration 적용
- 사용자가 기능을 끈 경우 기존 탭에 변경을 가하지 않음
- snapshot과 runtime metadata에 보존 기간 적용
- 매 탭 활성화마다 storage write를 하지 않도록 debounce·메모리 집계 후 필요한 정보만 저장

---

## 22. 리포트 연동

선택적으로 다음 정보를 세션 요약에 추가한다.

- 자동 정리된 탭 수
- 휴식 그룹으로 이동한 탭 수
- 사용자가 수정한 오분류 수
- 분류 필요 탭 수
- 작업 탭에서 휴식 탭으로 이동한 문맥 전환 횟수

전체 URL과 탭 제목을 리포트에 저장하지 않는다. hostname이 필요한 경우 기존 개인정보 원칙을 따른다.

점수나 문구는 사용자를 비난하지 않는다.

예시:

```text
이번 세션에서 작업 흐름이 5번 전환됐어요.
다음에는 휴식 그룹을 접어두면 도움이 될 수 있어요.
```

---

## 23. 테스트 요구사항

### 23.1 순수 함수

- hostname 정규화
- includeSubdomains 일치
- allowedDomain 최우선
- blockedDomain 휴식 분류
- 일정별 규칙이 전역 규칙보다 우선
- 휴식 중 생성 점수
- YouTube·Netflix 상황 의존 예외
- 최소 점수
- 점수 차이 부족 시 unclassified
- opener 관계 점수
- 세부 그룹 최소 탭 수
- 그룹 제목 생성

### 23.2 repository와 migration

- 기본 설정 migration
- 사용자 분류 규칙 저장·삭제
- 일정별·전역 규칙 충돌
- snapshot 생성·만료
- tab ID fallback
- 작업 세트 중복 URL 제거

### 23.3 Chrome wrapper 통합 수준

- 수동 정리 → 그룹 생성
- 집중 시작 → snapshot → 그룹화
- 집중 재개 → 휴식 탭 이동
- 기존 사용자 그룹 보존
- 고정 탭 제외
- 반복 실행 시 그룹 재사용
- 탭 한 개 실패 후 나머지 계속
- drag 중 제한 재시도
- 집중 종료 → 복원
- Service Worker 재시작 → snapshot 복구
- 새 탭 실시간 분류 debounce
- 사용자 수동 이동 cooldown

### 23.4 기존 회귀

- FOCUS_START 후 DNR 적용
- 휴식 중 타이머·차단 중지
- 재개 후 타이머·DNR 복구
- 완료·미완료 확인 UX
- Popup Side Panel 버튼
- 테스트 알림 반복 생성
- 기존 storage migration

---

## 24. 구현 단계

### Phase 1. 분석과 공용 타입

- 현재 FOCUS_START·FOCUS_RESUME·휴식·종료 흐름 분석
- manifest와 Chrome wrapper 확인
- 타입, 설정, storage migration 설계
- 구현 전에 변경 파일과 데이터 흐름 보고

### Phase 2. MVP 분류

- 현재 활성 창 탭 조회
- 제어 불가·고정 탭 필터
- 기본 카테고리와 점수 순수 함수
- 기본 5개 그룹 생성·재사용
- 수동 정리
- 결과 UI

### Phase 3. 집중·휴식 연동

- 집중 시작 snapshot
- 집중 시작 자동 정리
- 휴식 중 열린 탭 기록
- 집중 재개 분류
- 휴식 그룹 접기·펼치기
- 작업 탭 활성화

### Phase 4. 복원과 사용자 학습

- 집중 종료 레이아웃 복원
- 일정별·전역 수정 기억
- 분류 필요 확인 UI
- 작업 탭 세트

### Phase 5. 실시간·고급 관련도

- 새 탭 실시간 분류 옵션
- opener 관계
- 같은 저장소·localhost port 관련도
- 제한된 세부 그룹
- 문맥 전환 요약

### Phase 6. 문서와 검증

- README
- USER_GUIDE
- PRIVACY
- NOTION_PROJECT
- 앱 내부 Help
- typecheck, lint, test, build
- Chrome 수동 회귀

AI 분류는 별도 승인과 개인정보·비용 설계가 있기 전까지 구현하지 않는다.

---

## 25. 완료 기준

- 집중 시작 시 현재 활성 창의 탭을 자동 분류한다.
- 수동으로 언제든 탭을 다시 정리할 수 있다.
- 현재 일정의 허용 사이트가 최우선으로 작업에 분류된다.
- 휴식 중 연 Netflix가 일정에 필요하지 않으면 휴식 그룹으로 이동한다.
- Netflix 탭을 자동으로 닫지 않는다.
- 일정에 Netflix가 허용되어 있으면 작업 또는 참고로 분류할 수 있다.
- 집중 시작·재개 시 휴식 그룹이 접힌다.
- 작업 그룹이 펼쳐지고 작업 탭이 활성화된다.
- 불확실한 탭을 분류 필요로 처리한다.
- 고정 탭과 사용자 그룹을 기본적으로 보존한다.
- Chrome 제한 페이지가 전체 정리를 실패시키지 않는다.
- 반복 실행해도 중복 미루지마 그룹이 쌓이지 않는다.
- 사용자의 수동 이동을 자동화보다 우선한다.
- 집중 종료 시 레이아웃 복원 선택이 동작한다.
- 탭 그룹화 실패가 집중·차단 기능을 중단시키지 않는다.
- 페이지 본문·검색어·입력값을 읽거나 저장하지 않는다.
- 기존 테스트와 신규 테스트가 통과한다.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`가 통과한다.

---

## 26. Chrome 수동 검증

production build 후 최소 다음을 확인한다.

1. 여러 일반 탭을 연 상태에서 수동 정리
2. 일정 allowedDomains 기반 작업 분류
3. 휴식 중 Netflix를 연 뒤 집중 재개
4. Netflix가 휴식 그룹으로 이동하고 그룹이 접히는지 확인
5. Netflix 허용 일정에서는 작업으로 남는지 확인
6. YouTube 강의 일정 예외
7. 고정 탭 유지
8. 기존 사용자 그룹 유지
9. 정리 반복 실행 후 중복 그룹 없음
10. 탭 drag 직후 자동 재이동 없음
11. Chrome 내부 페이지 제외
12. 집중 종료 후 레이아웃 복원
13. Service Worker 재시작 후 snapshot 복구
14. 최소 Side Panel, Popup 380px, 전체 페이지 UI
15. 집중 시작·휴식·재개·종료 후 DNR과 타이머 회귀 없음

---

## 27. 최종 보고 형식

구현 완료 시 다음을 보고한다.

1. 사용자가 체감하는 탭 정리 흐름
2. 추가·수정한 핵심 파일
3. Manifest 권한 변경과 이유
4. storage schema와 migration
5. 분류 우선순위와 점수 기준
6. 휴식 중 Netflix 처리 결과
7. 기존 그룹·고정 탭·복원 정책
8. 개인정보 영향
9. 신규·회귀 테스트
10. typecheck, lint, test, build 결과
11. Chrome에서 직접 확인할 제한과 수동 테스트

“탭 그룹을 만들었다”만 보고하지 않는다. 일정 context, 휴식 전환, 사용자 수정, 복원, 기존 차단 기능과의 회귀까지 검증한다.
