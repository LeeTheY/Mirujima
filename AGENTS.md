# AGENTS.md — 미루지마(Mirujima) v2 개발 명세

> 이 파일은 **미루지마(Mirujima) Chrome Extension 전체 개발과 후속 개선을 Codex에 위임하기 위한 최상위 실행 명세서**다.
> Codex는 이 문서를 프로젝트의 요구사항, 아키텍처, 구현 순서, 품질 기준, 회귀 방지 기준, 문서화 기준으로 사용한다.
>
> 문서 버전: `2.0`
> 기준 구현일: `2026-07-14`
> 현재 상태: React + TypeScript + Vite 기반 Manifest V3 MVP 구현 및 반복 개선 완료

### 문서 적용 우선순위

이 문서는 초기 제품 명세와 실제 구현 과정에서 확정된 후속 요구사항을 함께 포함한다.

1. **섹션 29 이후의 v2 확정 명세**
2. 섹션 0~28의 초기 제품 명세
3. 현재 코드와 테스트가 증명하는 동작

초기 명세와 v2 확정 명세가 충돌하면 섹션 29 이후 내용을 우선한다. 현재 기능을 변경할 때는 단순히 이전 동작을 제거하지 말고, 변경 이유와 회귀 테스트를 함께 남긴다.

---

## 0. Codex 최종 목표

현재 폴더의 상태를 확인한 뒤, 필요한 경우 프로젝트 생성부터 시작하여 아래 결과물을 완성한다.

- React + TypeScript + Vite 기반 Chrome Extension
- Chrome Extension Manifest V3
- npm 기반 설치·실행·빌드 환경
- Side Panel과 Popup 모두 지원
- 첫 실행 시 사용자가 Side Panel 또는 Popup을 주 UI로 선택
- 일정 계획, 집중 세션, 사이트 차단, 행동 확인 알림, 일일 리포트 구현
- 프로그램 내부 사용 설명서와 첫 실행 온보딩 구현
- `README.md` 작성
- `docs/NOTION_PROJECT.md` 작성
- `docs/USER_GUIDE.md` 작성
- 모든 구현 후 typecheck, lint, test, build 검증

Codex는 단순한 UI 목업이 아니라 **Chrome에 로드하여 실제로 사용할 수 있는 완성도 높은 확장 프로그램**을 구현한다.

---

## 1. 프로젝트 기본 정보

| 항목 | 내용 |
|---|---|
| 프로젝트명 | 미루지마 (Mirujima) |
| 유형 | Chrome Extension |
| 규격 | Manifest V3 |
| 패키지 관리자 | npm |
| 프런트엔드 | React |
| 언어 | TypeScript |
| 빌드 도구 | Vite |
| 기본 UI | Side Panel |
| 보조 UI | Popup |
| 저장 방식 | `chrome.storage.local` |
| 목적 | 사용자가 계획한 시간에 실제 행동하도록 돕고, 딴짓·자리 비움·미루기를 감지하거나 차단하며 하루의 집중 결과를 기록한다. |

### 1.1 아이콘

- 프로젝트에 제공된 `Mirujima_Icon.png`를 확장 프로그램 아이콘과 앱 브랜드 이미지로 사용한다.
- 파일 위치를 먼저 검색하고 `public/icons/` 또는 현재 프로젝트 자산 구조에 맞는 위치로 정리한다.
- Manifest의 `16`, `32`, `48`, `128` 아이콘을 구성한다.
- 원본 파일이 없다면 임의의 다른 브랜드 아이콘으로 조용히 대체하지 않는다.
- 빌드에 필요한 임시 아이콘을 만든 경우 최종 결과에 그 사실과 교체 위치를 반드시 명시한다.

---

## 2. 제품 정의

미루지마는 사용자가 하루 계획과 사용할 사이트를 미리 정하면 다음을 수행하는 집중 보조 확장 프로그램이다.

1. 일정 시작 시 즉시 알림을 보낸다.
2. 사용자가 집중을 시작하면 해당 일정에서 허용한 사이트만 이용할 수 있게 한다.
3. 방해 사이트 또는 계획에 없는 사이트 접근을 브라우저 단계에서 차단한다.
4. 자리 비움, 오랜 무활동, 반복적인 차단 시도, 허용 사이트 이탈을 감지한다.
5. 집중하지 않는 것으로 판단되면 즉시 상태 확인 알림을 표시한다.
6. 일정 완료 후 실제 집중 시간과 방해 행동을 기록한다.
7. 하루가 끝나면 전날 기록과 달성률을 확인할 수 있는 리포트를 만든다.

### 2.1 핵심 제품 원칙

- 집중 세션 중 방해 사이트는 경고만 하는 것이 아니라 실제 진입을 차단한다.
- 차단은 사용자의 일정과 허용 사이트 설정을 기준으로 동작한다.
- 긴급 상황을 위한 명시적 임시 허용 경로는 제공하되, 사용 이유와 시간을 기록한다.
- 사용자 입력 내용, 페이지 본문, 검색어, 폼 값은 수집하지 않는다.
- URL 전체 대신 가능한 경우 정규화된 hostname만 저장한다.
- Chrome 외부 애플리케이션 사용 여부를 감시한다고 표현하지 않는다.
- Chrome 활동과 `chrome.idle`로 확인 가능한 시스템 유휴 상태만 사용한다.
- 과도한 감시보다 투명한 기준, 사용자의 통제권, 최소 수집을 우선한다.

---

## 3. Codex 실행 규칙

### 3.1 작업 시작 전

Codex는 다음 순서로 진행한다.

1. 현재 폴더 구조를 확인한다.
2. `package.json`, 기존 소스, 설정 파일, 이미지 자산을 확인한다.
3. 기존 프로젝트가 있으면 구조를 유지하면서 확장한다.
4. 빈 폴더라면 React + TypeScript + Vite 프로젝트를 생성한다.
5. npm을 사용해 필요한 패키지를 설치한다.
6. 구현 전에 데이터 흐름, Chrome API 책임, UI 진입점을 정리한다.
7. 아래 구현 단계 순서에 따라 기능을 완성한다.
8. 마지막에 typecheck, lint, test, build를 실행한다.
9. 실행하지 못하거나 실패한 검사는 원인과 남은 작업을 최종 보고에 적는다.

### 3.2 자동 진행 원칙

- 사소한 선택은 이 문서의 기본값으로 판단하고 작업을 계속한다.
- 구현을 멈추고 사용자에게 반복 질문하지 않는다.
- 요청과 무관한 대규모 리팩터링은 하지 않는다.
- 기존 사용자 데이터를 깨뜨리는 저장소 변경은 migration 없이 하지 않는다.
- 타입 오류를 `any`, 무분별한 type assertion, non-null assertion으로 숨기지 않는다.
- 필요한 개발 의존성은 설치할 수 있다.
- 새로운 production dependency는 반드시 필요성을 검토하고 최소화한다.
- Chrome 기본 API와 작은 유틸 함수로 해결 가능한 기능에 무거운 라이브러리를 추가하지 않는다.

### 3.3 우선 사용 기술

- React
- TypeScript `strict: true`
- Vite
- Chrome Manifest V3 API
- CSS Modules 또는 프로젝트 전체에서 일관된 단일 스타일 방식
- Vitest
- ESLint

상태 관리 라이브러리는 처음부터 추가하지 않는다. React Context와 feature hook으로 관리가 어려울 정도로 복잡해질 때만 도입한다.

---

## 4. 지원 범위와 플랫폼 제약

### 4.1 반드시 지원

- 일반 `http://`, `https://` 사이트
- 일정별 허용 사이트
- 집중 중 미허용 사이트 차단
- Chrome 시스템 알림
- Chrome 아이콘 배지
- Side Panel
- Popup
- Chrome 재시작 및 Service Worker 재시작 후 상태 복구
- macOS와 Windows에서 핵심 기능이 동일하게 이해되도록 설계

### 4.2 제약을 명확히 처리

다음 영역은 Chrome Extension에서 완전히 제어할 수 없으므로 허위로 보장하지 않는다.

- `chrome://` 페이지
- Chrome Web Store 등 Chrome이 확장 프로그램 접근을 제한하는 페이지
- 다른 브라우저
- Chrome 밖의 데스크톱 앱 사용 내용
- OS가 Chrome 알림을 차단한 상태에서의 시스템 알림 표시

알림은 플랫폼 제약 안에서 최대한 확실히 보이도록 다중 채널로 구현한다.

---

## 5. 사용자 흐름

### 5.1 첫 실행 온보딩

첫 실행 시 다음 단계를 순서대로 제공한다.

1. 미루지마 소개
2. 주 UI 선택
   - Side Panel
   - Popup
3. 알림 동작 테스트
4. 기본 집중 방식 선택
   - 허용 사이트만 이용
   - 지정한 방해 사이트만 차단
5. 기본 자리 비움 기준 선택
   - 3분
   - 5분
   - 10분
6. 간단한 첫 일정 생성
7. 프로그램 사용법 확인

사용자가 건너뛸 수 있지만, 주 UI 기본값은 Side Panel로 저장한다.

### 5.2 오늘 일정 작성

사용자는 오늘 할 일을 간단하게 작성한다.

각 일정에는 다음을 입력할 수 있다.

- 일정명
- 설명 또는 목표
- 시작 시각
- 종료 시각
- 목표 집중 시간
- 사용할 사이트 목록
- 차단 모드
- 휴식 시간
- 집중 활동 유형

활동 유형:

```ts
type ActivityMode = "interactive" | "reading" | "watching" | "offline";
```

- `interactive`: 입력·클릭이 자주 필요한 작업
- `reading`: 문서 읽기처럼 활동이 적을 수 있는 작업
- `watching`: 강의·영상 시청처럼 장시간 입력이 없을 수 있는 작업
- `offline`: 브라우저를 거의 사용하지 않는 작업

활동 유형에 따라 무활동 확인 기준을 다르게 적용하여 오탐을 줄인다.

### 5.3 집중 시작

집중 시작 시 다음을 수행한다.

1. 활성 집중 세션을 storage에 저장한다.
2. 종료 시각과 확인 시각을 `chrome.alarms`에 등록한다.
3. 일정의 사이트 차단 규칙을 활성화한다.
4. 현재 상태를 Side Panel, Popup, 배지에 반영한다.
5. 허용 사이트가 있으면 첫 번째 사이트를 열 수 있는 버튼을 제공한다.

### 5.4 집중 중

- 허용 사이트에서는 집중 타이머를 표시한다.
- 미허용 사이트 접근은 차단 페이지로 리디렉션한다.
- 차단 시도는 hostname, 시각, 일정 ID만 기록한다.
- 반복 차단 시도 또는 유휴 상태가 발생하면 즉시 상태 확인 알림을 띄운다.
- 사용자는 계속 집중, 잠깐 휴식, 일정 수정, 세션 종료 중 하나를 선택할 수 있다.

### 5.5 일정 종료

- 사용자가 완료 또는 미완료를 선택한다.
- 목표 시간과 실제 집중 시간을 비교한다.
- 방해 시도, 자리 비움, 미루기 횟수를 정리한다.
- 다음 일정이 있으면 다음 일정 시작 정보를 보여준다.

### 5.6 일일 기록

- 날짜가 바뀌거나 다음 실행 시 이전 날짜 리포트를 idempotent하게 생성한다.
- 리포트는 Side Panel과 큰 화면 리포트 페이지에서 확인한다.
- 최소 최근 30일을 조회할 수 있게 한다.

---

## 6. UI 아키텍처

```ts
export type MainUI = "sidepanel" | "popup";

export const DEFAULT_MAIN_UI: MainUI = "sidepanel";
```

### 6.1 Side Panel

주요 기능을 모두 제공하는 기본 화면이다.

페이지:

- `Today`: 오늘 일정, 현재 집중, 다음 일정
- `Plan`: 일정 생성·수정·삭제
- `Focus`: 현재 세션, 타이머, 허용 사이트, 상태 확인
- `Reports`: 일일 기록, 달성률, 최근 추세
- `Settings`: 주 UI, 알림, 차단, 유휴 기준, 개인정보
- `Help`: 프로그램 사용법, 알림 문제 해결, 자주 묻는 질문

### 6.2 Popup

사용자가 Popup을 주 UI로 선택하면 축약형 메인 UI를 제공한다.

필수 기능:

- 현재 일정
- 다음 일정
- 집중 시작·일시정지·재개·종료
- 5분 미루기
- 현재 차단 상태
- 오늘 달성률
- 전체 화면 또는 Side Panel 열기

복잡한 리포트와 긴 일정 편집 폼은 별도 확장 페이지에서 연다.

### 6.3 확장 프로그램 페이지

`app.html` 또는 동등한 확장 페이지에서 넓은 화면이 필요한 기능을 제공한다.

- 전체 일정 편집
- 일일·주간 리포트
- 프로그램 사용법
- 개인정보와 저장 데이터 관리

Side Panel과 동일한 feature, repository, hook을 재사용한다.

### 6.4 Content Script

Content Script의 책임은 다음으로 제한한다.

- 허용 사이트에서 최소한의 활동 heartbeat 생성
- 페이지 visibility 상태 전달
- 필요한 경우 집중 상태 표시 위젯 제공
- Background와 타입 안전한 메시지 통신

금지:

- 일정 상태의 최종 판단
- 영속 데이터 직접 변경
- 리포트 생성
- Chrome alarm 생성

### 6.5 차단 페이지

미허용 사이트 접근 시 확장 프로그램 내부 차단 페이지를 표시한다.

필수 표시:

- 현재 집중 일정명
- 차단된 이유
- 남은 집중 시간
- 허용된 사이트 목록
- 집중 화면으로 돌아가기
- 긴급 임시 허용

임시 허용은 다음을 요구한다.

- 허용 시간 선택: 1분, 5분, 이번 세션
- 간단한 이유 선택 또는 입력
- 이벤트 기록
- 만료 alarm 등록

---

## 7. 확장 프로그램에 맞춘 디자인

### 7.1 디자인 방향

- 작은 화면에서도 상태와 주요 행동이 즉시 보이는 집중형 UI
- 데스크톱 웹 대시보드처럼 과도하게 넓거나 복잡하게 만들지 않는다.
- 한 화면에서 가장 중요한 행동은 1개, 보조 행동은 최대 2개를 우선한다.
- 카드, 상태 배지, 진행률, 짧은 문장을 중심으로 설계한다.
- Side Panel과 Popup의 시각 언어를 통일한다.

### 7.2 권장 크기

- Popup: 약 `360px × 560~620px`
- Side Panel: `320px` 이상에서 자연스럽게 반응
- 터치·클릭 대상 최소 높이: `40px`
- 본문 폰트 최소: `13px`

### 7.3 주요 컴포넌트

- `CurrentTaskCard`
- `NextScheduleCard`
- `FocusTimer`
- `ProgressRing` 또는 `ProgressBar`
- `StatusBadge`
- `DomainChip`
- `ScheduleForm`
- `BlockingModeSelector`
- `CheckInDialog`
- `DailyReportCard`
- `NotificationHealthCard`
- `HelpArticle`
- `EmptyState`

### 7.4 접근성

- 색상만으로 상태를 구분하지 않는다.
- 모든 버튼에 명확한 텍스트 또는 접근성 이름을 제공한다.
- 키보드 탐색을 지원한다.
- 충분한 명도 대비를 유지한다.
- 모션 감소 설정을 존중한다.

---

## 8. 권장 프로젝트 구조

```text
.
├─ public/
│  ├─ icons/
│  │  └─ Mirujima_Icon.png
│  └─ blocked.html 관련 정적 자산
├─ src/
│  ├─ background/
│  │  ├─ service-worker.ts
│  │  ├─ bootstrap.ts
│  │  ├─ alarms.ts
│  │  ├─ notifications.ts
│  │  ├─ blocking.ts
│  │  ├─ idle.ts
│  │  ├─ activity.ts
│  │  ├─ reports.ts
│  │  └─ message-handler.ts
│  ├─ content/
│  │  ├─ index.ts
│  │  ├─ activity-heartbeat.ts
│  │  └─ focus-indicator.tsx
│  ├─ popup/
│  │  ├─ main.tsx
│  │  └─ PopupApp.tsx
│  ├─ sidepanel/
│  │  ├─ main.tsx
│  │  └─ SidePanelApp.tsx
│  ├─ app/
│  │  ├─ main.tsx
│  │  └─ App.tsx
│  ├─ blocked/
│  │  ├─ main.tsx
│  │  └─ BlockedApp.tsx
│  ├─ features/
│  │  ├─ onboarding/
│  │  ├─ schedules/
│  │  ├─ focus/
│  │  ├─ blocking/
│  │  ├─ activity-check/
│  │  ├─ reports/
│  │  ├─ settings/
│  │  └─ help/
│  ├─ shared/
│  │  ├─ chrome/
│  │  ├─ storage/
│  │  ├─ time/
│  │  ├─ types/
│  │  ├─ constants/
│  │  ├─ utils/
│  │  └─ ui/
│  ├─ manifest.ts 또는 manifest.json
│  └─ vite-env.d.ts
├─ docs/
│  ├─ NOTION_PROJECT.md
│  ├─ USER_GUIDE.md
│  └─ PRIVACY.md
├─ README.md
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

폴더명은 기존 구조가 있다면 합리적으로 조정할 수 있지만, 책임 분리는 유지한다.

---

## 9. Manifest V3와 Chrome API

### 9.1 사용 후보 API

- `chrome.storage`
- `chrome.alarms`
- `chrome.notifications`
- `chrome.idle`
- `chrome.tabs`
- `chrome.action`
- `chrome.sidePanel`
- `chrome.declarativeNetRequest`
- 필요 시 `chrome.webNavigation`
- 필요 시 `chrome.runtime`

### 9.2 권한 원칙

- 실제로 사용하는 권한만 선언한다.
- 임의의 모든 브라우징 데이터를 수집하지 않는다.
- 임의 도메인에 대한 일정별 차단을 위해 넓은 host permission이 필요하다면 온보딩과 개인정보 문서에 이유를 설명한다.
- 권한을 추가한 이유를 `README.md`와 `docs/PRIVACY.md`에 작성한다.

### 9.3 Service Worker 규칙

Manifest V3 Service Worker는 지속 실행되지 않는다.

금지:

- 중요 상태를 전역 변수에만 저장
- 장기 예약을 `setTimeout`에만 의존
- Service Worker가 계속 살아 있다고 가정

필수:

- 현재 일정과 세션 상태는 storage에 저장
- 예약 작업은 `chrome.alarms` 사용
- `runtime.onStartup`, `runtime.onInstalled`, UI 진입 시 복구 로직 실행
- active session과 차단 규칙의 일관성을 검사
- 중복 alarm과 중복 notification 정리

---

## 10. 사이트 차단 설계

### 10.1 차단 모드

```ts
type BlockingMode = "allowlist" | "blocklist" | "off";
```

#### Allowlist 모드

- 집중 세션 동안 일정에 등록된 도메인만 허용한다.
- 일반적인 방해 사이트뿐 아니라 계획에 없는 모든 `http/https` 사이트를 차단한다.
- 기본 추천 모드다.

#### Blocklist 모드

- 사용자가 방해 사이트로 등록한 도메인만 차단한다.
- 조사 범위가 넓은 작업에 사용한다.

#### Off

- 사이트 차단 없이 타이머와 기록만 사용한다.

### 10.2 구현 방식

- 집중 세션용 차단은 `chrome.declarativeNetRequest`의 session rules를 우선 사용한다.
- 브라우저 재시작 시 storage를 기준으로 규칙을 복구한다.
- 세션 종료, 취소, 일시정지, 임시 허용 만료 시 규칙을 정확히 갱신한다.
- 고정 rule ID 범위를 정의하고 충돌을 방지한다.
- redirect 대상은 확장 프로그램 내부 `blocked.html`로 한다.
- 차단 페이지 자체, 확장 프로그램 페이지, 필수 Chrome 내부 URL은 차단 대상에서 제외한다.

### 10.3 도메인 처리

- 입력값에서 protocol, path, query, hash를 제거한다.
- hostname은 소문자로 정규화한다.
- `www.` 처리 정책을 일관되게 적용한다.
- 서브도메인 포함 여부를 데이터로 명시한다.
- 중복 도메인을 제거한다.
- 잘못된 입력은 폼 단계에서 오류를 표시한다.

### 10.4 차단 이벤트

저장 항목:

- 일정 ID
- 세션 ID
- 정규화된 hostname
- 발생 시각
- 결과: blocked, temporaryAllowed, returned

저장하지 않는 항목:

- 전체 URL
- query string
- 페이지 제목
- 페이지 본문
- 사용자 입력값

---

## 11. 집중 상태 확인 엔진

### 11.1 사용 신호

다음 신호를 단독이 아니라 조합하여 사용한다.

- `chrome.idle` 상태
- 현재 활성 탭 hostname
- 허용 사이트 여부
- 페이지 visibility
- 최소 활동 heartbeat
- 반복 차단 시도
- 일정 시작 후 미시작 상태
- 과도한 snooze

### 11.2 최소 활동 heartbeat

- Content Script는 클릭, 키 입력, 스크롤, pointer 활동의 **발생 시각만** 집계한다.
- 실제 키 값, 클릭 대상 텍스트, 입력 내용은 전송하지 않는다.
- 너무 잦게 저장하지 않고 debounce 또는 interval 집계를 사용한다.
- `reading`, `watching` 모드에서는 입력이 없다는 이유만으로 즉시 경고하지 않는다.

### 11.3 상태 판단 예시

```ts
type FocusHealth = "healthy" | "needs-check" | "distracted" | "away";
```

- `healthy`: 허용 사이트에서 정상 활동
- `needs-check`: 활동이 적거나 일정 시작 후 반응 없음
- `distracted`: 미허용 사이트 접근 또는 반복 차단 시도
- `away`: `chrome.idle`이 기준 시간을 초과

판정 로직은 순수 함수로 분리하고 테스트한다.

### 11.4 확인 알림

상태가 `needs-check`, `distracted`, `away`로 바뀌면 다음 메시지 중 상황에 맞는 알림을 즉시 생성한다.

- “현재 계획한 작업을 진행하고 있나요?”
- “집중 사이트를 벗어났어요. 다시 돌아갈까요?”
- “잠시 자리를 비운 것 같아요. 타이머를 멈출까요?”

가능한 동작:

- 계속 집중
- 5분 휴식
- 타이머 일시정지
- 일정 열기

알림 폭주를 막기 위해 동일 상태에는 cooldown을 적용한다.

---

## 12. 알림 신뢰성 설계

사용자는 알림이 확실히 보이기를 원한다. 하지만 OS 또는 Chrome 설정이 알림을 차단할 수 있으므로 다음 다중 채널을 함께 구현한다.

1. `chrome.notifications` 시스템 알림
2. `chrome.action.setBadgeText` 배지 표시
3. Side Panel/Popup 상단 경고 배너
4. 미허용 사이트 접근 시 차단 페이지
5. 확장 프로그램을 열었을 때 놓친 중요 알림 표시

### 12.1 알림 이벤트

```ts
type NotificationKind =
  | "schedule-start"
  | "schedule-overdue"
  | "snooze-warning"
  | "focus-check"
  | "distraction-detected"
  | "idle-check"
  | "break-end"
  | "focus-end"
  | "next-schedule"
  | "report-ready";
```

### 12.2 중복 방지

- 알림 ID는 종류와 entity ID로 안정적으로 만든다.
- 최근 발송 시각과 처리 여부를 storage에 저장한다.
- alarm 재실행과 Service Worker 재시작으로 같은 알림이 반복되지 않게 한다.

```ts
const notificationId = `${kind}:${entityId}`;
```

### 12.3 온보딩 알림 테스트

- 테스트 알림을 생성한다.
- 사용자가 “알림이 보였어요”를 확인하게 한다.
- 보이지 않았을 때 Chrome 및 OS 알림 설정 안내를 앱 내부 Help에 표시한다.
- 설정 화면에 알림 상태 점검 카드를 제공한다.

### 12.4 알림 클릭

- 알림 본문 클릭 시 사용자가 선택한 주 UI를 연다.
- Side Panel 선택 시 가능한 경우 해당 Side Panel을 연다.
- Popup은 API로 강제 열 수 없는 제약이 있으므로, 필요한 경우 확장 페이지 또는 Side Panel로 fallback한다.
- 알림 버튼은 최대 2개를 우선한다.

---

## 13. 핵심 데이터 모델

```ts
export type ScheduleStatus =
  | "scheduled"
  | "snoozed"
  | "focusing"
  | "paused"
  | "completed"
  | "cancelled"
  | "incomplete";

export interface DomainRule {
  hostname: string;
  includeSubdomains: boolean;
}

export interface Schedule {
  id: string;
  title: string;
  description: string;
  dateKey: string;
  startAt: string;
  endAt: string;
  targetFocusMinutes: number;
  activityMode: ActivityMode;
  blockingMode: BlockingMode;
  allowedDomains: DomainRule[];
  blockedDomains: DomainRule[];
  breakMinutes: number;
  status: ScheduleStatus;
  snoozeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FocusSession {
  id: string;
  scheduleId: string;
  dateKey: string;
  startedAt: string;
  endedAt: string | null;
  pausedAt: string | null;
  accumulatedFocusSeconds: number;
  distractionSeconds: number;
  idleSeconds: number;
  blockedAttemptCount: number;
  checkInCount: number;
  status: "active" | "paused" | "completed" | "cancelled";
}

export interface ActivityEvent {
  id: string;
  scheduleId: string;
  sessionId: string;
  type:
    | "heartbeat"
    | "blocked-attempt"
    | "temporary-allow"
    | "idle-start"
    | "idle-end"
    | "check-in"
    | "snooze";
  hostname?: string;
  occurredAt: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface DailyReport {
  id: string;
  dateKey: string;
  plannedCount: number;
  completedCount: number;
  incompleteCount: number;
  achievementRate: number;
  plannedFocusMinutes: number;
  actualFocusMinutes: number;
  focusRate: number;
  snoozeCount: number;
  blockedAttemptCount: number;
  idleMinutes: number;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  schemaVersion: number;
  onboardingCompleted: boolean;
  mainUI: MainUI;
  defaultBlockingMode: BlockingMode;
  idleThresholdMinutes: 3 | 5 | 10;
  notificationsEnabled: boolean;
  distractionWarningsEnabled: boolean;
  activityHeartbeatEnabled: boolean;
  dailyReportEnabled: boolean;
}
```

### 13.1 상태 머신

```ts
export type FocusState =
  | { type: "idle" }
  | { type: "scheduled"; scheduleId: string }
  | { type: "snoozed"; scheduleId: string; until: string }
  | { type: "focusing"; scheduleId: string; sessionId: string }
  | { type: "paused"; scheduleId: string; sessionId: string }
  | { type: "completed"; scheduleId: string; sessionId: string };
```

여러 boolean 조합으로 집중 상태를 표현하지 않는다.

---

## 14. Storage 설계

```ts
export const STORAGE_KEYS = {
  schemaVersion: "mirujima:schema-version",
  schedules: "mirujima:schedules",
  activeSession: "mirujima:active-session",
  activityEvents: "mirujima:activity-events",
  reports: "mirujima:reports",
  settings: "mirujima:settings",
  notificationState: "mirujima:notification-state",
  temporaryAllows: "mirujima:temporary-allows"
} as const;
```

원칙:

- UI 컴포넌트에서 `chrome.storage`를 직접 호출하지 않는다.
- repository를 통해 읽고 쓴다.
- storage 변경은 `chrome.storage.onChanged`로 구독한다.
- schema version과 migration을 구현한다.
- 매초 storage에 타이머 값을 저장하지 않는다.
- 시작 시각과 누적 시간을 기준으로 UI에서 현재 시간을 계산한다.
- 이벤트 데이터에는 보존 기간을 둔다.
- 기본 이벤트 보존 기간은 30일로 한다.

---

## 15. 메시지 통신

Background, Popup, Side Panel, App Page, Content Script 사이 메시지는 공용 discriminated union으로 정의한다.

```ts
export type ExtensionMessage =
  | { type: "APP_BOOTSTRAP" }
  | { type: "SCHEDULE_CREATE"; payload: Schedule }
  | { type: "SCHEDULE_UPDATE"; payload: Schedule }
  | { type: "SCHEDULE_DELETE"; scheduleId: string }
  | { type: "SCHEDULE_SNOOZE"; scheduleId: string; minutes: number }
  | { type: "FOCUS_START"; scheduleId: string }
  | { type: "FOCUS_PAUSE" }
  | { type: "FOCUS_RESUME" }
  | { type: "FOCUS_FINISH"; result: "completed" | "incomplete" }
  | { type: "ACTIVITY_HEARTBEAT"; occurredAt: string; visible: boolean }
  | { type: "BLOCKED_ATTEMPT"; hostname: string }
  | { type: "TEMPORARY_ALLOW"; hostname: string; minutes: number; reason: string }
  | { type: "IDLE_ACTION"; action: "continue" | "break" | "pause" }
  | { type: "OPEN_MAIN_UI"; target?: MainUI }
  | { type: "GENERATE_DAILY_REPORT"; dateKey: string };
```

- 요청과 응답 타입을 분리한다.
- runtime error를 사용자에게 이해 가능한 메시지로 변환한다.
- 문자열 이벤트 이름을 여러 파일에 중복 작성하지 않는다.

---

## 16. 일정과 시간 처리

- 저장: ISO 8601 문자열
- 계산: timestamp
- 날짜 키: 사용자 로컬 기준 `YYYY-MM-DD`
- 표시: 사용자 로컬 시간
- 자정 경계를 고려한다.
- 같은 날짜의 겹치는 일정을 저장할 때 사용자에게 경고한다.
- 과거 일정 시작 시각을 입력하면 명확한 validation을 표시한다.
- Chrome 재시작 후 현재 시각에 맞춰 상태를 재계산한다.
- 이미 지난 alarm을 발견하면 한 번만 복구 처리한다.

### 16.1 일정 시작 알림

표시 예시:

```text
“React 프로젝트”를 시작할 시간이에요.
계획한 사이트: github.com, developer.mozilla.org
```

버튼:

- 지금 시작
- 5분 미루기

### 16.2 미루기 경고

- 1~2회: 일반 알림
- 3회 이상: 강한 경고와 누적 지연 시간 표시
- 미루기 횟수와 지연 시간은 리포트에 반영

---

## 17. 리포트와 달성률

### 17.1 계산 기준

```ts
achievementRate = plannedCount === 0
  ? 0
  : Math.round((completedCount / plannedCount) * 100);

focusRate = plannedFocusMinutes === 0
  ? 0
  : Math.min(100, Math.round((actualFocusMinutes / plannedFocusMinutes) * 100));
```

### 17.2 일일 리포트 필수 항목

- 계획한 일정 수
- 완료 일정 수
- 미완료 일정 수
- 일정 달성률
- 목표 집중 시간
- 실제 집중 시간
- 집중 시간 달성률
- 미루기 횟수
- 차단된 사이트 접근 횟수
- 자리 비움 시간
- 가장 집중이 잘 된 일정
- 다음 날을 위한 짧은 로컬 요약

### 17.3 리포트 화면

- 오늘 요약
- 어제 기록
- 최근 7일 추세
- 최근 30일 달력
- 날짜별 상세 보기

외부 AI API 없이도 동작하도록 규칙 기반 로컬 요약을 먼저 구현한다.
외부 AI 연동은 backend와 키 관리 방식이 제공되기 전까지 MVP 범위에 포함하지 않는다.

---

## 18. 프로그램 내부 사용 설명서

Help 페이지를 실제 프로그램에 포함한다.

필수 문서:

1. 미루지마가 하는 일
2. 첫 일정 만드는 법
3. 허용 사이트 등록 방법
4. Allowlist와 Blocklist 차이
5. 집중 시작과 종료 방법
6. 차단 페이지 사용법
7. 임시 허용 사용법
8. 자리 비움 확인 알림
9. Side Panel과 Popup 변경 방법
10. 일일 리포트 보는 법
11. 알림이 보이지 않을 때 확인 방법
12. 저장 데이터 삭제 방법
13. 개인정보 처리 방식
14. Chrome에서 확장 프로그램 로드하는 방법

Help 내용은 `docs/USER_GUIDE.md`와 핵심 내용을 공유하여 중복 관리하지 않도록 한다.

---

## 19. 설정

필수 설정:

- 주 UI: Side Panel / Popup
- 기본 차단 모드
- 기본 자리 비움 기준
- 알림 사용
- 집중 상태 확인 알림
- 활동 heartbeat 사용
- 일일 리포트 생성
- 기본 방해 사이트 목록
- 데이터 내보내기
- 기록 초기화
- 온보딩 다시 보기
- 알림 테스트

기록 초기화는 확인 단계를 거친다.

---

## 20. 개인정보와 보안

- 전체 브라우징 기록을 저장하지 않는다.
- 페이지 본문을 읽거나 저장하지 않는다.
- 입력 필드의 값을 수집하지 않는다.
- URL query와 hash를 저장하지 않는다.
- hostname과 최소 이벤트만 저장한다.
- 모든 기본 데이터는 로컬에 저장한다.
- 외부 네트워크 전송을 MVP에 포함하지 않는다.
- API 키를 확장 프로그램 번들에 포함하지 않는다.
- 개인정보 문서를 `docs/PRIVACY.md`로 작성한다.
- 사용자가 기록 전체를 삭제할 수 있게 한다.

---

## 21. 오류 처리와 복구

반드시 처리할 경우:

- storage 데이터가 없거나 일부만 존재
- 잘못된 날짜 데이터
- 삭제된 일정의 alarm이 남아 있음
- 활성 세션은 있으나 DNR 규칙이 없음
- DNR 규칙은 있으나 활성 세션이 없음
- 중복 alarm
- 중복 notification
- Chrome 재시작 중 집중 세션
- 자정이 지난 세션
- 권한 또는 API 호출 실패
- 제공된 아이콘 파일 누락

복구는 idempotent해야 한다.

---

## 22. 구현 단계

### Phase 1. 프로젝트 기반

- Vite + React + TypeScript 생성 또는 기존 구조 확인
- npm scripts 구성
- Manifest V3 구성
- Popup, Side Panel, App Page, Background 진입점 구성
- 아이콘 연결
- build 성공

### Phase 2. 공용 기반

- 타입
- storage repository
- migration
- 시간 유틸
- Chrome API wrapper
- 메시지 통신
- 기본 UI 토큰과 공용 컴포넌트

### Phase 3. 온보딩과 UI 선택

- 첫 실행 흐름
- Side Panel / Popup 선택
- 알림 테스트
- 설정 저장
- Help 진입

### Phase 4. 일정

- 오늘 일정 목록
- 일정 CRUD
- 도메인 입력과 validation
- 일정 alarm
- 미루기

### Phase 5. 집중 세션

- 시작·일시정지·재개·종료
- 타이머
- 상태 머신
- Service Worker 복구
- 배지

### Phase 6. 사이트 차단

- DNR session rules
- Allowlist / Blocklist
- 차단 페이지
- 임시 허용과 만료
- 차단 이벤트 기록

### Phase 7. 집중 상태 확인

- `chrome.idle`
- heartbeat
- active tab 판단
- FocusHealth 계산
- cooldown이 있는 확인 알림

### Phase 8. 리포트

- 일일 리포트 생성
- 어제 기록
- 최근 7일
- 최근 30일
- 달성률 계산
- 로컬 요약

### Phase 9. 문서와 마감

- 프로그램 내부 Help
- `README.md`
- `docs/USER_GUIDE.md`
- `docs/NOTION_PROJECT.md`
- `docs/PRIVACY.md`
- 테스트 보강
- typecheck, lint, test, build

각 Phase가 끝날 때 다음 Phase의 기능을 깨뜨리지 않는 최소 검증을 수행한다.

---

## 23. 테스트 요구사항

### 23.1 단위 테스트

- 도메인 정규화
- 서브도메인 매칭
- allowlist 판정
- blocklist 판정
- DNR rule 생성
- 달성률 계산
- 집중 시간 계산
- 자정 경계
- snooze 누적
- 3회 이상 미루기 경고
- 알림 중복 방지
- FocusHealth 판정
- 임시 허용 만료
- 상태 머신 전환
- report idempotency
- storage migration

### 23.2 통합 수준 검증

- 일정 생성 → alarm 등록
- 집중 시작 → 차단 규칙 생성
- 집중 일시정지 → 차단 규칙 해제 또는 정책대로 변경
- 집중 재개 → 규칙 복구
- 집중 종료 → 규칙 제거와 리포트 반영
- Chrome 재시작 복구
- UI 모드 설정 유지
- 알림 클릭 동작

Chrome API는 wrapper를 통해 mock 가능하게 만든다.

---

## 24. npm scripts

최소 다음 scripts를 제공한다.

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

실제 프로젝트 구조에 따라 명령은 조정할 수 있지만 같은 목적을 유지한다.

---

## 25. 문서 산출물

### 25.1 README.md

반드시 포함:

- 프로젝트 소개
- 주요 기능
- 기술 스택
- 폴더 구조
- 설치 방법
- 개발 서버 또는 watch 실행 방법
- build 방법
- Chrome에 `dist` 로드하는 방법
- Side Panel과 Popup 사용법
- 권한 설명
- 테스트 방법
- 알려진 플랫폼 제약

### 25.2 docs/NOTION_PROJECT.md

노션에 그대로 붙여넣기 좋은 Markdown으로 작성한다.

반드시 포함:

- 프로젝트 한 줄 소개
- 프로젝트 배경
- 해결하려는 문제
- 서비스 소개
- 주요 사용자
- 핵심 기능
- 사용자 흐름
- 기술 스택
- 아키텍처
- 차단·알림 설계
- 데이터와 개인정보
- 화면 구성
- 개발 과정
- 테스트
- 개선 방향
- 회고 작성용 섹션

### 25.3 docs/USER_GUIDE.md

프로그램 내부 Help와 같은 사용자 관점의 설명서를 작성한다.
개발자 용어보다 실제 사용 순서 중심으로 작성한다.

### 25.4 docs/PRIVACY.md

- 수집하는 데이터
- 수집하지 않는 데이터
- 저장 위치
- 보존 기간
- 삭제 방법
- 권한 사용 이유
- 외부 전송 여부

---

## 26. 완료 기준

모든 항목을 만족해야 완료다.

- React + TypeScript + Vite 기반이다.
- Manifest V3로 빌드된다.
- npm으로 설치와 실행이 가능하다.
- `Mirujima_Icon.png`가 적용되어 있다.
- Side Panel과 Popup이 모두 동작한다.
- 첫 실행 시 주 UI를 선택할 수 있다.
- 오늘 일정을 생성·수정·삭제할 수 있다.
- 일정 시작 알림이 동작한다.
- 집중 시작·일시정지·재개·종료가 동작한다.
- 집중 중 미허용 사이트가 실제로 차단된다.
- 차단 페이지와 임시 허용이 동작한다.
- 자리 비움과 반복 방해 행동에 확인 알림이 발생한다.
- 알림이 배지와 UI 상태에도 반영된다.
- 하루 리포트와 전날 기록을 볼 수 있다.
- Chrome 또는 Service Worker 재시작 후 중요 상태가 복구된다.
- 프로그램 내부 Help가 존재한다.
- README, Notion 문서, 사용자 설명서, 개인정보 문서가 존재한다.
- TypeScript 오류가 없다.
- lint가 통과한다.
- 테스트가 통과한다.
- production build가 성공한다.
- 불필요한 권한과 외부 전송이 없다.

---

## 27. 금지 사항

- Manifest V2 사용
- Popup 하나에 모든 기능을 억지로 넣기
- 중요 상태를 메모리에만 저장
- 장기 예약에 `setTimeout`만 사용
- 탭 변경만 감시하고 실제 차단은 하지 않는 구현
- 차단 중에도 대상 사이트가 그대로 보이게 두는 구현
- 전체 브라우징 기록 저장
- 페이지 본문 또는 입력값 수집
- URL query 저장
- API 키 번들 포함
- 사용자 동의 없는 외부 전송
- `any`로 타입 문제 우회
- 테스트 없는 시간 계산 변경
- 중복 알림 방치
- Chrome 재시작 복구 누락
- 요청과 무관한 대규모 리팩터링
- 빌드 실패 상태로 완료 처리
- 문서 없이 기능만 구현

---

## 28. Codex 최종 실행 요청

Codex는 이 `AGENTS.md`를 읽고 프로젝트 전체를 구현한다.

실행 조건:

- React
- TypeScript
- Vite
- Chrome Extension Manifest V3
- npm 사용
- Side Panel 기본 지원
- Popup 지원
- 사용자가 첫 실행 시 Side Panel 또는 Popup 선택
- 필요한 npm 패키지 설치
- 제공된 `Mirujima_Icon.png` 사용
- 프로젝트 내부 사용 설명서 구현
- README 작성
- 노션 정리용 프로젝트 문서 작성
- 사용자 설명서 작성
- 개인정보 문서 작성
- 구현 후 build 성공 여부 확인

최종 응답에는 다음을 보고한다.

1. 구현한 기능
2. 생성·수정한 주요 파일
3. 설치한 패키지와 이유
4. 사용한 Chrome 권한과 이유
5. 실행한 검증 명령과 결과
6. Chrome에 설치하고 사용하는 방법
7. 남아 있는 플랫폼 제약 또는 미완료 항목

---

## 29. v2 현재 구현 기준선

이 섹션은 초기 명세 이후 실제 개발과 사용자 피드백을 반영한 현재 프로젝트의 기준선이다. 후속 Codex 작업은 빈 프로젝트를 새로 만들지 말고 이 기준선을 보존하면서 확장한다.

### 29.1 현재 산출물

| 영역 | 현재 구현 |
|---|---|
| Extension | Chrome Manifest V3, Chrome 116 이상 |
| UI | Side Panel, Popup, 전체 확장 페이지, 차단 페이지 |
| 진입점 | `sidepanel.html`, `popup.html`, `app.html`, `blocked.html` |
| 상태 | `chrome.storage.local` repository와 schema migration |
| Background | Service Worker, alarm, notification, DNR, idle, report, message handler |
| 차단 | DNR session rules 기반 Allowlist/Blocklist/Off |
| 집중 | 시작, 일시정지, 재개, 완료, 미완료 종료, badge |
| 기록 | 일정, 세션, 최소 활동 이벤트, 임시 허용, 최근 30일 리포트 |
| 개인정보 | 외부 전송 없음, 전체 URL/query/본문/입력값 저장 금지 |
| 문서 | README, USER_GUIDE, NOTION_PROJECT, PRIVACY |
| 검증 | typecheck, lint, Vitest, production build |

### 29.2 실제 주요 파일

```text
public/manifest.json
src/background/service-worker.ts
src/background/message-handler.ts
src/background/notifications.ts
src/background/blocking.ts
src/background/activity.ts
src/background/idle.ts
src/background/reports.ts
src/features/schedules/ScheduleForm.tsx
src/features/schedules/site-presets.ts
src/features/dashboard/TodayPage.tsx
src/features/focus/FocusPage.tsx
src/features/reports/ReportsPage.tsx
src/features/settings/SettingsPage.tsx
src/popup/PopupApp.tsx
src/blocked/BlockedApp.tsx
src/shared/ui/AppContext.tsx
src/shared/ui/MainShell.tsx
src/shared/ui/styles.css
```

### 29.3 현재 검증 스냅샷

2026-07-14 기준 다음 검사가 통과한 상태다.

```text
npm run typecheck  -> pass
npm run lint       -> pass
npm test           -> 8 files, 28 tests pass
npm run build      -> pass
```

테스트 개수는 기능 추가에 따라 늘어날 수 있다. 후속 작업에서는 숫자를 고정 목표로 삼지 말고 기존 테스트가 줄거나 사라지지 않는지 확인한다.

---

## 30. v2 확정 UI 및 반응형 규격

### 30.1 Popup

- Chrome Popup 문서는 `380px` 기준 폭을 사용한다.
- `html`, `body`, `#root`, `.popup`에 Popup 전용 최소·최대 폭을 지정하여 콘텐츠 폭만큼 얇아지는 현상을 금지한다.
- 권장 최소 높이는 `600px`이며 Chrome이 제공하는 실제 화면 높이 안에서 세로 스크롤을 허용한다.
- Popup에는 현재/다음 일정, 집중 제어, 오늘 달성률, Side Panel 열기, 전체 화면 열기만 우선 표시한다.
- Popup의 버튼과 일정 카드가 공용 Side Panel 하단 nav 여백의 영향을 받지 않도록 `.popup .content` 규칙을 별도로 유지한다.
- Popup에서 `Side Panel 열기`를 누르면 전체 화면이 아니라 실제 Side Panel이 열려야 한다.

### 30.2 Side Panel

- Side Panel의 외부 폭은 Chrome과 사용자가 결정한다. 앱은 특정 고정 폭을 강제하지 않는다.
- 기본 폼은 1열이다. 좁은 Side Panel에서 2열 입력을 억지로 유지하지 않는다.
- 하단 메뉴는 좁은 폭에서 `3 × 2` grid로 배치한다.
- 콘텐츠 하단에는 고정 nav 높이와 safe area를 고려한 충분한 padding을 둔다.
- 카드, 입력, 버튼, domain chip에는 `min-width: 0`, 긴 문자열 줄바꿈, 최대 폭 제한을 적용한다.

### 30.3 전체 확장 페이지

- `700px` 이상에서만 일정 폼을 2열로 확장한다.
- 브랜드 헤더 다음에 페이지 nav, 그 다음 콘텐츠가 오도록 시각 순서를 유지한다.
- Side Panel과 동일한 feature와 component를 사용하되 넓은 화면에서만 grid 수를 늘린다.

### 30.4 일정 카드

일정 카드는 다음 영역을 시각적으로 분리한다.

1. 날짜·시간·일정명·상태 header
2. 설명
3. 목표 집중 시간·활동 유형·차단 방식 meta
4. 허용 사이트 또는 방해 사이트 목록
5. 수정·삭제·집중 시작 action

필수 규칙:

- 사이트 목록과 action 버튼 사이에는 여백과 구분선을 둔다.
- action은 독립 반응형 grid를 사용한다.
- 버튼이 domain chip 위에 겹치거나 카드 밖으로 나오는 상태를 허용하지 않는다.
- 긴 일정명과 hostname은 `overflow-wrap`으로 카드 안에서 줄바꿈한다.
- Blocklist 일정에는 허용 사이트가 아니라 실제 방해 사이트 목록을 표시한다.

### 30.5 차단 페이지

- 원본 `Mirujima_Icon.png`를 크기 지정 없이 렌더링하지 않는다.
- 차단 페이지 브랜드 아이콘은 데스크톱 `48 × 48px`, 좁은 화면 `42 × 42px`를 기준으로 한다.
- `object-fit: contain`, 정사각형 aspect ratio, 전용 class를 사용한다.
- 카드 전체는 `overflow: hidden`으로 이미지·배경·자식 요소가 모서리 밖으로 나오지 않게 한다.
- 다음 영역을 분리한다.
  - 브랜드와 집중 보호 상태
  - 차단 hostname과 차단 이유
  - 남은 시간과 집중 화면 복귀
  - 이번 일정 허용 사이트
  - 긴급 임시 허용
- 긴 hostname, 임시 허용 입력, 버튼은 `520px` 이하에서 세로 배치한다.

### 30.6 공용 여백과 넘침 방지

- 모든 card는 `width: 100%`, `min-width: 0`, 내부 padding을 가진다.
- stack 기본 간격은 약 `16px`을 유지한다.
- 버튼 최소 높이는 `44px`을 유지한다.
- 입력은 항상 부모 폭 안에서 렌더링한다.
- 고정 `width`는 Popup 문서처럼 Chrome surface 규격상 필요한 경우에만 사용한다.
- 수정 후 최소 Side Panel 폭, Popup 380px, 전체 화면을 각각 확인한다.

### 30.7 집중 페이지 구조

집중 페이지는 다음 영역을 하나의 연속 흐름으로 붙이지 않고 명시적으로 분리한다.

1. 현재 일정명과 세션 상태 header
2. 남은 시간·진행 시간·목표 시간 timer panel
3. 목표 진행률
4. 현재 허용 또는 차단 사이트 panel
5. 일시정지·재개·완료·미완료 action
6. 차단 시도·상태 확인 metric
7. 차단 정책과 개인정보 안내

Side Panel에서는 세로 1열을 사용하고, 전체 확장 페이지의 충분한 폭에서만 현재 세션과 상태 정보를 2열로 배치한다. 타이머 panel, 사이트 panel, action 사이에는 독립 padding과 section 간격을 둔다.

### 30.8 리포트 페이지 구조

각 일일 리포트는 다음 영역을 분리한다.

1. 날짜와 완료 일정 수 header
2. 실제/목표 집중 시간, 차단 시도, 미루기, 자리 비움 metric grid
3. 일정 달성률과 집중 시간 달성률 progress section
4. 규칙 기반 오늘의 요약
5. 가장 집중한 일정

리포트 card 내부 기본 section 간격은 약 `22px`을 유지한다. Side Panel metric은 2열, 전체 확장 페이지의 충분한 폭에서는 4열까지 확장할 수 있다. progress 두 항목은 별도 영역과 구분선을 사용한다.

---

## 31. v2 알림 정책

### 31.1 실제 서비스 알림

- 일정 시작, 집중 확인, 방해 감지, 자리 비움, 집중 종료 알림에는 중복 방지 cooldown을 적용한다.
- 알림 ID는 종류와 entity ID를 조합한 안정적인 값으로 유지한다.
- 시스템 알림 실패가 전체 UI 요청 실패로 전파되지 않게 한다.
- 시스템 알림이 실패해도 badge와 앱 내부 미처리 알림은 유지한다.
- 알림 아이콘은 상대 경로가 아니라 다음 형태의 확장 절대 URL을 사용한다.

```ts
chrome.runtime.getURL("icons/icon-128.png")
```

### 31.2 테스트 알림

온보딩과 Settings의 테스트 알림은 일반 알림과 정책이 다르다.

- 사용자가 버튼을 누를 때마다 반드시 새 알림 생성을 시도한다.
- 일반 notification cooldown을 적용하지 않는다.
- 매 클릭마다 `crypto.randomUUID()` 기반 고유 ID를 만든다.
- 기존 테스트 알림과 테스트 notification state는 다음 테스트 전에 정리한다.
- 같은 ID를 clear/create하는 방식만 사용하지 않는다. Chrome 또는 OS가 단순 갱신으로 판단하여 banner를 다시 표시하지 않을 수 있다.
- Chrome/OS 자체 알림 차단은 앱이 우회할 수 없으므로 Help 안내를 유지한다.

### 31.3 알림 클릭과 Side Panel

- 알림 본문 클릭은 사용자가 선택한 주 UI를 연다.
- Popup은 API로 강제 open할 수 없으므로 알림 클릭 시 Side Panel 또는 확장 페이지 fallback을 사용할 수 있다.
- 단, Popup 내부의 명시적 `Side Panel 열기` 버튼에는 fallback을 적용하지 않는다. 실패하면 Popup 안에서 오류를 보여준다.

---

## 32. v2 차단 모드 및 사이트 프리셋

### 32.1 사용자에게 보여줄 의미

- **허용 사이트만(Allowlist)**: 입력하거나 선택한 hostname과 정책상 포함된 서브도메인만 허용하고 나머지 일반 http/https 사이트를 차단한다.
- **방해 사이트만(Blocklist)**: 입력하거나 선택한 hostname만 차단하고 나머지는 허용한다.
- **차단 끄기(Off)**: 두 목록을 차단에 사용하지 않고 타이머와 기록만 제공한다.

폼에서는 현재 선택한 방식과 관계없는 입력란을 숨긴다. 기존 입력값은 모드 전환 시 삭제하지 않고 다시 돌아왔을 때 복원한다.

### 32.2 클릭형 사이트 프리셋

- 허용 사이트와 방해 사이트 모두 자주 쓰는 hostname 프리셋 버튼을 제공한다.
- 클릭하면 추가되고 다시 클릭하면 제거된다.
- 직접 URL 또는 hostname을 입력하는 기능은 유지한다.
- 외부 favicon URL을 런타임에 다운로드하지 않는다.
- 프리셋 아이콘은 앱 내부 텍스트 mark 또는 번들된 로컬 자산을 사용한다.
- URL 형식 직접 입력도 정규화 후 프리셋 선택 상태로 인식한다.

현재 예시:

- 허용: Google, 네이버, GitHub, Notion, Gmail, Slack, ChatGPT, Claude, YouTube, MDN
- 방해: YouTube, Instagram, Facebook, X, TikTok, Netflix, Twitch, Reddit, 디시인사이드, 에펨코리아

프리셋 추가 시 hostname, 서비스명, 내부 mark를 `site-presets.ts` 한 곳에서 관리한다.

---

## 33. v2 오류 UX

### 33.1 작업 오류와 치명적 오류 분리

다음과 같은 오류는 앱 전체 로딩 오류가 아니다.

- 일정 시간이 겹침
- 과거 일정 입력
- 잘못된 도메인
- 진행 중 일정 삭제 시도
- 이미 진행 중인 세션에서 새 집중 시작

이 오류 때문에 Root 전체를 오류 화면으로 교체하지 않는다.

- 일정 validation 오류는 현재 ScheduleForm 안에 표시한다.
- Plan의 일정 폼에는 `일정 목록으로 돌아가기` 버튼을 제공한다.
- 그 외 action 오류는 현재 페이지 상단의 닫을 수 있는 banner로 표시한다.
- 사용자가 입력한 값과 현재 페이지 상태를 보존한다.

### 33.2 초기 로딩 오류

storage/bootstrap/runtime 연결처럼 화면 자체를 준비하지 못한 경우에만 전체 오류 화면을 사용한다.

필수 버튼:

- `다시 시도`: `APP_BOOTSTRAP`을 다시 호출한다.
- `이전 화면으로`: fatal error 상태를 해제하고 가능한 경우 browser history로 돌아간다.

일반 작업 오류에 “확장 프로그램을 다시 로드하세요”라는 안내를 표시하지 않는다.

---

## 34. Popup에서 Side Panel 열기

`chrome.sidePanel.open()`은 사용자 동작에 직접 연결되어야 한다.

Popup 구현 규칙:

1. Popup mount 시 `chrome.windows.getCurrent()`로 현재 window ID를 미리 준비한다.
2. 준비 전에는 버튼을 disabled 상태로 표시한다.
3. 클릭 handler 안에서 Background 메시지를 거치지 않고 즉시 아래 API를 호출한다.

```ts
chrome.sidePanel.open({ windowId: currentWindowId });
```

4. 성공하면 Popup을 닫는다.
5. 실패하면 Popup 내부 오류 banner를 표시한다.
6. 실패를 `app.html` 전체 화면 open으로 조용히 대체하지 않는다.

Background의 `OPEN_MAIN_UI`는 알림 클릭과 일반 fallback에는 사용할 수 있지만 Popup의 명시적 Side Panel 버튼에는 사용하지 않는다.

---

## 35. 해결된 주요 회귀와 재발 방지

| 문제 | 원인 | 확정 해결 기준 |
|---|---|---|
| 알림 이미지 다운로드 실패 | notification에 상대 icon URL 사용 | `chrome.runtime.getURL` 사용, API 실패 격리 |
| 테스트 알림이 한 번만 표시됨 | 고정 ID와 cooldown, OS의 갱신 처리 | 매 클릭 고유 UUID, 기존 테스트 알림 정리 |
| 차단 페이지 아이콘이 카드 밖으로 나감 | 온보딩 전용 class만 존재, 원본 크기 노출 | 차단 전용 크기·object-fit·overflow 적용 |
| Popup이 매우 얇게 표시됨 | 공용 `100vw` 반응형 규칙에 Popup 폭 위임 | Popup 문서 380px 규격 분리 |
| 일정 사이트와 시작 버튼이 붙거나 겹침 | 카드 내부 영역과 action 간격 부재 | 사이트 영역과 action grid 분리 |
| 간단한 validation이 전체 오류 화면을 만듦 | action error와 bootstrap error가 같은 state 사용 | fatal/action error state 분리 |
| Popup의 Side Panel 버튼이 전체 화면을 엶 | Background await 후 user gesture 소실과 fallback | Popup click에서 직접 `sidePanel.open` 호출 |
| 확장 reload 후 기존 탭에서 `Extension context invalidated` 발생 | 이전 Content Script의 interval이 무효화된 runtime을 계속 호출 | runtime ID 사전 확인, 동기·비동기 오류 처리 후 heartbeat listener와 interval 중단 |

후속 수정은 이 표의 모든 항목을 수동 또는 자동으로 다시 확인한다.

---

## 36. v2 테스트 및 마감 절차

### 36.1 필수 자동 검증

모든 코드 수정 후 최소 다음을 실행한다.

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

다음 정책에는 순수 함수 또는 단위 테스트를 유지한다.

- notification cooldown과 테스트 알림 예외
- 테스트 notification ID 판정
- 도메인 정규화와 프리셋 toggle
- Allowlist/Blocklist/DNR rule
- FocusHealth와 상태 머신
- 일정·리포트 시간 계산
- storage migration

### 36.2 Chrome 수동 회귀 점검

production build 후 `chrome://extensions`에서 확장 프로그램을 reload하고 다음을 확인한다.

1. Popup이 약 380px 폭으로 정상 표시되는가
2. Popup의 Side Panel 버튼이 실제 Side Panel을 여는가
3. 테스트 알림 버튼을 연속으로 눌렀을 때 매번 새 알림이 생성되는가
4. 일정 겹침 오류가 폼 안에 표시되고 목록으로 돌아갈 수 있는가
5. Allowlist에서 미등록 사이트가 차단되는가
6. Blocklist에서 등록 사이트만 차단되는가
7. 차단 페이지 아이콘과 카드가 화면 밖으로 나오지 않는가
8. Side Panel 최소 폭에서 일정 card, domain chip, action이 겹치지 않는가
9. 일시정지·재개·종료 후 DNR rule과 badge가 맞는가
10. Service Worker 재시작 후 활성 세션이 복구되는가
11. 확장 프로그램 reload 전에 열어둔 일반 웹 탭에서 `Extension context invalidated` 오류가 반복되지 않는가

### 36.3 배포 전 문서 동기화

동작이나 UI 정책이 바뀌면 다음 파일을 함께 검토한다.

- `AGENTS.md`
- `README.md`
- `docs/USER_GUIDE.md`
- `docs/PRIVACY.md`
- `docs/NOTION_PROJECT.md`

권한, 수집 데이터, 보존 기간이 바뀌면 `docs/PRIVACY.md` 수정은 필수다.

---

## 37. v2 최종 완료 기준

초기 섹션 26의 완료 기준에 더해 다음을 만족해야 한다.

- Popup은 읽을 수 있는 380px 기준 폭으로 표시된다.
- Side Panel 최소 폭에서 가로 넘침이 없다.
- 일정 card의 사이트 목록과 action이 분리되어 있다.
- 테스트 알림은 매 클릭마다 고유 알림 생성 요청을 수행한다.
- 시스템 알림 실패가 앱 전체 오류로 전환되지 않는다.
- Popup의 Side Panel 버튼이 전체 화면 fallback 없이 실제 Side Panel을 연다.
- 일반 validation 오류가 현재 폼과 입력 상태를 보존한다.
- fatal error 화면에는 다시 시도와 이전 화면 버튼이 있다.
- 차단 페이지 아이콘 비율과 card overflow가 안정적이다.
- 모든 자동 검증이 통과한다.
- Chrome 수동 회귀 점검 결과를 최종 보고에 명시한다.

---

## 38. 후속 Codex 최종 보고 형식

후속 구현 완료 응답에는 다음을 보고한다.

1. 이번 요청에서 바뀐 사용자 동작
2. 수정한 핵심 파일
3. storage/permission/data model 영향
4. 추가하거나 갱신한 회귀 테스트
5. typecheck, lint, test, build 결과
6. Chrome reload 또는 데이터 migration 필요 여부
7. 직접 확인이 필요한 Chrome/OS 제약

“빌드 성공”만 보고하지 말고, 사용자 요청이 실제 어느 UI와 상태 전환에 반영되었는지 명확히 적는다.

---

## 39. v2 집중 종료·상태 확인·일정 시간 UX 확정 명세

### 39.1 목표 시간 종료

- 집중 타이머는 실제 세션 시작 시각부터 목표 집중 시간만큼 계산한다.
- 일시정지와 휴식 동안 목표 시간은 흐르지 않으며 재개 시 남은 시간으로 종료 alarm을 다시 만든다.
- 목표 시간이 끝나면 세션을 `awaiting-result`로 전환한다.
- 결과 선택 대기에서는 타이머 누적, DNR 차단, focus-check를 멈춘다.
- Focus와 Popup은 일시정지·재개 동작을 숨기고 완료/미완료 선택만 우선 표시한다.
- 종료 알림에도 완료/미완료 버튼을 제공하며 결과 선택 전까지 active session을 보존한다.
- Focus, Popup, Today의 완료/미완료 버튼은 사용자 확인 대화상자에서 한 번 더 확정해야 `FOCUS_FINISH`를 전송한다.
- 시스템 종료 알림의 완료/미완료 버튼은 즉시 기록하지 않고 `확정/돌아가기` 후속 알림을 한 번 더 거친다.
- 실제 집중 시간은 alarm 처리 지연이나 늦은 사용자 입력 때문에 목표 시간을 초과해 기록하지 않는다.

### 39.2 일정 시간 자동 계산

- 새 일정의 목표 집중 시간 입력은 빈 상태로 시작하며 `0`을 강제로 남기지 않는다.
- 빈 값은 편집 중 허용하지만 저장할 수 없다.
- 새 일정에서 유효한 목표 시간을 처음 입력하는 순간 시작 시각은 현재 시각의 5분 뒤로 정한다.
- 종료 시각은 항상 시작 시각 + 목표 집중 시간으로 자동 계산하고 읽기 전용으로 표시한다.
- 사용자가 시작 시각 또는 목표 시간을 바꾸면 종료 시각을 다시 계산한다.

### 39.3 상태 확인과 자리 비움

- focus-check는 활성 집중 중 1분마다 실행한다.
- 활동 유형별 heartbeat 무활동 기준은 interactive 5분, reading 15분, watching 45분이며 offline은 Chrome 활동량을 판단에서 제외한다.
- 최근 5분 내 2회 이상 차단 시도 또는 미허용 활성 탭은 distracted 신호다.
- 자리 비움은 설정한 3·5·10분 동안 운영체제 수준 키보드·마우스 입력이 없거나 화면이 잠긴 상태다.
- 페이지 본문, 입력값, Chrome 밖 앱의 사용 내용은 감지하거나 저장하지 않는다.

### 39.4 알림 처리

- Today 상단의 미처리 알림은 개수만 보여주지 않고 제목, 본문, 발생 시각, 이동/결과/확인 처리 동작을 제공한다.
- 시스템 알림 본문 클릭은 주 UI를 열며 미처리 항목을 조용히 제거하지 않는다.
- 일정 시작, 자리 비움, 방해 감지, 휴식 종료, 목표 시간 종료 알림에는 상황에 맞는 직접 동작 버튼을 제공한다.
- 경고 문구는 감지 기준과 사용자가 지금 할 행동을 명확히 포함한다.

### 39.5 기본 휴식과 데이터 내보내기

- 일정의 휴식 시간은 강제 종료 시간이 아니라 권장 휴식 기준이다.
- 새 일정의 권장 휴식 입력은 빈 값으로 시작하고 빈 값이나 0은 저장할 수 없다.
- Today, Plan, Popup 일정 요약에는 목표 집중 시간과 권장 휴식 시간을 함께 표시한다.
- 휴식 버튼은 활성 집중 중 언제든 누를 수 있고 버튼 문구에 고정 분을 표시하지 않는다.
- 휴식 중에는 집중 타이머와 차단을 멈추고 별도 휴식 타이머를 표시한다.
- 여러 휴식은 회차별로 초기화하지 않고 같은 일정의 누적 휴식 시간을 공유한다.
- 누적 권장 시간 전에는 전체 잔여 시간을, 누적 초과 후에는 `+시간`을 계속 표시한다.
- 종료 alarm은 재개를 권하지만 휴식을 자동 종료하지 않는다.
- 집중 재개 또는 세션 종료 시 실제 휴식 초를 누적하고 일일 리포트의 휴식 시간에 포함한다.
- JSON 내보내기는 백업과 개발 점검용 원본 데이터다. 가져오기나 표 변환을 지원한다고 표현하지 않는다.
