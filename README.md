# 미루지마 (Mirujima)

> 계획을 적는 데서 끝내지 않고, 집중 행동과 학습 기록까지 연결하는 로컬 우선 Chrome 확장 프로그램

미루지마는 오늘 할 일과 사용할 사이트를 미리 정하면 일정 알림, 집중 타이머, 사이트 차단, 자리 비움 확인, 탭 정리, 일일 리포트를 하나의 흐름으로 제공하는 Chrome Extension입니다. 학습과 작업 기록은 기본적으로 사용자의 Chrome 로컬 저장소에 보관되며, Premium을 선택한 경우에만 계정 기반 동기화와 화면 OCR·AI 문법 교정·요약 기능을 사용합니다.

## 프로젝트를 만든 이유

이 프로젝트는 제가 실제로 학습하고 글을 쓰는 과정에서 반복해서 겪은 불편을 해결하기 위해 시작했습니다.

- **학습 과정을 기록하고 싶었습니다.** 무엇을 계획했고 얼마나 집중했는지, 실제로 완료했는지를 기억이나 수기 기록에 의존하지 않고 하루 단위로 남기고 싶었습니다.
- **공부 중 딴짓을 줄이고 싶었습니다.** 할 일 목록과 타이머만으로는 무의식적으로 YouTube, 커뮤니티, SNS 같은 사이트를 여는 행동을 막기 어려웠습니다.
- **계획을 실제 시작으로 연결하고 싶었습니다.** 계획을 작성해도 시작 시각을 놓치거나 계속 미루는 문제를 알림, 미루기 기록, 집중 시작 동작으로 보완하고 싶었습니다.
- **자기소개서와 문서를 더 빠르게 다듬고 싶었습니다.** 글을 작성할 때마다 맞춤법·문법을 별도 서비스에서 확인하고 다시 붙여 넣는 과정을 줄이고, 원문과 변경 이유를 바로 비교하고 싶었습니다.
- **화면의 중요한 내용을 즉시 확인하고 싶었습니다.** 강의, 문서, 표를 보다가 필요한 영역만 선택해 핵심 내용과 학습 포인트를 정리하고 원문 근거까지 확인하고 싶었습니다.
- **수익화 가능한 제품 구조도 고민하고 싶었습니다.** 핵심 집중 기능은 누구나 로컬에서 사용할 수 있게 유지하면서, 장기 기록과 AI 기능은 Premium으로 분리해 서비스 확장 가능성을 설계했습니다.

## 문제를 해결한 방법

| 해결하려는 문제 | 적용한 방법 |
|---|---|
| 계획만 세우고 시작하지 못함 | 일정 시작 알림, 5분 미루기, 미루기 누적 경고, Today의 빠른 집중 시작 |
| 공부 중 습관적으로 딴짓함 | 일정별 Allowlist·Blocklist와 Manifest V3 DNR 기반 실제 사이트 차단 |
| 집중과 휴식 시간을 정확히 모름 | 재시작 후에도 복구되는 집중 상태, 누적 집중·휴식 시간, 완료·미완료 기록 |
| 학습 기록이 흩어짐 | 날짜별 리포트, 달성률, 집중·휴식·미루기·차단·자리 비움 집계, Premium 학습 잔디 |
| 탭이 많아 작업 맥락을 잃음 | 현재 작업·참고 자료·커뮤니케이션·휴식·분류 필요 그룹으로 스마트 탭 정리 |
| 문법 검사와 윤문이 번거로움 | 선택 영역 OCR, 맞춤법·문법 교정, 자연스러운/간결한 윤문, diff와 변경 이유 제공 |
| 긴 자료의 핵심을 빠르게 찾기 어려움 | OCR 문단·표·목록 block을 근거로 한 핵심 요약과 학습 정리 |
| 개인정보가 과도하게 수집될 수 있음 | Free 기능 로컬 우선, URL 대신 hostname 중심 기록, AI 실행 전 미리보기와 명시적 동의 |
| 기능이 늘면서 기존 기능이 깨질 수 있음 | `AGENTS.md`와 기능별 `docs/` 명세, additive change 원칙, 회귀 테스트와 4단계 품질 검사 |

## 서비스 구성

미루지마는 로그인 없이 사용할 수 있는 **Free 집중 도구**와 계정·서버 기능이 필요한 **Premium 확장 기능**으로 나뉩니다.

| 구분 | 제공 기능 | 현재 상태 |
|---|---|---|
| Free | 일정, 집중 타이머, 휴식, 사이트 차단, 알림, 리포트, 스마트 탭 그룹화, 로컬 저장 | 구현 |
| Premium | Google 로그인, 학습 잔디, 365일 구조화 기록 동기화, 화면 OCR, 문법 교정·윤문, 핵심 요약, 학습 정리 | 코드·UI 구현, Supabase·OAuth·Groq 실환경 검증 필요 |
| 결제 | 실제 카드 결제, 구독 갱신, 해지, 영수증, Customer Portal | **미구현** |

현재 Premium 선택과 서버 entitlement 구조는 구현되어 있지만 실제 결제는 연결되어 있지 않습니다. 따라서 현재 버전은 결제 정보를 받지 않고 `onboarding_deferred` 상태로 Premium을 활성화합니다. 화면에 표시되는 월 가격은 제품 구조를 검토하기 위한 값이며 실제 청구가 발생하지 않습니다.

## 모든 기능

### 1. 온보딩과 화면 선택

- 소개 → 멤버십 → 주 화면 → 알림 → 차단 방식 → 자리 비움 기준 → 첫 일정 → 완료의 8단계 온보딩
- 로그인 없는 Free 시작과 선택적 Premium 로그인
- Side Panel 또는 Popup을 주 UI로 선택하고 Settings에서 언제든 변경
- Chrome·운영체제 알림 상태를 확인하기 위한 반복 가능한 테스트 알림

### 2. 일정 관리

- 일정명, 목표, 날짜, 시작 시각, 목표 집중 시간, 활동 유형, 권장 휴식 입력
- 목표 집중 시간을 기준으로 종료 시각 자동 계산
- 일정 생성·수정·삭제와 과거 시각·겹치는 일정·잘못된 도메인 검증
- 입력 작업, 읽기, 영상 시청, 오프라인 작업에 맞춘 활동 기준
- 자주 사용하는 허용·방해 사이트를 클릭형 preset으로 추가·제거
- 5분 미루기와 3회 이상 누적 시 강화된 경고

### 3. 집중 세션과 휴식

- 한 번에 하나의 활성 집중 세션 유지
- 집중 시작·일시정지·휴식·재개·완료·미완료 종료
- 휴식을 여러 번 사용해도 일정 단위로 누적하고 권장 시간 초과분을 `+시간`으로 표시
- 목표 시간이 끝나면 차단과 시간 누적을 멈추고 완료/미완료 결과 선택 대기
- 결과를 바로 확정하지 않고 한 번 더 확인하는 종료 흐름
- Service Worker나 Chrome이 재시작되어도 storage를 기준으로 타이머, alarm, badge, 차단 규칙 복구

### 4. 사이트 차단과 임시 허용

- **Allowlist**: 일정에 등록한 사이트만 허용
- **Blocklist**: 등록한 방해 사이트만 차단
- **Off**: 차단 없이 타이머와 기록만 사용
- `chrome.declarativeNetRequest` session rule로 미허용 main-frame 요청을 차단 페이지로 이동
- protocol, path, query, hash, `www.`를 제거한 hostname 정규화와 서브도메인 처리
- 차단 페이지에서 일정명, 차단 이유, 남은 시간, 허용 사이트 확인
- 꼭 필요한 사이트는 1분·5분·이번 세션 중 하나와 이유를 선택해 임시 허용
- 전체 URL이 아닌 일정·세션·hostname·발생 시각만 차단 이벤트로 기록

### 5. 집중 상태 확인과 알림

- `chrome.idle`, 활성 탭 hostname, 화면 visibility, 최소 활동 heartbeat, 반복 차단 시도를 조합한 상태 판단
- 입력 작업 5분, 읽기 15분, 영상 45분의 서로 다른 무활동 기준
- 오프라인 작업은 Chrome 입력량을 집중 판단에서 제외해 오탐 방지
- healthy, needs-check, distracted, away 상태와 동일 알림 cooldown
- 일정 시작, 미루기, 방해, 자리 비움, 휴식 종료, 목표 종료, 다음 일정, 리포트 알림
- 시스템 알림, 확장 아이콘 badge, 앱 내부 미처리 알림, 차단 페이지의 다중 채널 안내

### 6. 리포트와 학습 기록

- 날짜별 계획·완료·미완료 일정 수와 일정 달성률
- 목표·실제 집중 시간과 집중 시간 달성률
- 실제 휴식 시간, 미루기, 차단 시도, 자리 비움 집계
- 가장 집중한 일정과 다음 날을 위한 규칙 기반 로컬 요약
- 최근 30일 로컬 기록과 같은 날짜에 중복을 만들지 않는 리포트 생성
- Premium 월간 학습 잔디, 일별 상세 점수, Today 연속 학습 일수
- 학습 점수: `집중 분 + 완료 일정 수 × 10`

### 7. 스마트 탭 그룹화

- 현재 활성 일반 창의 탭을 `현재 작업`, `참고 자료`, `커뮤니케이션`, `휴식 탭`, `분류 필요`로 정리
- 일정 허용 사이트, 저장한 작업 탭 세트, 사용자 교정 규칙을 우선해 분류
- 집중 시작·재개 시 자동 실행하거나 Focus·Popup에서 수동 실행
- 고정 탭과 사용자가 만든 기존 그룹을 기본적으로 보존
- 정리 전 탭·그룹 snapshot을 로컬에 저장하고 가능한 범위에서 복원
- 애매한 탭은 이번만·현재 일정·항상 기억 중 범위를 선택해 분류 교정
- 탭을 자동으로 닫거나 새로 열지 않으며, 그룹화 실패가 집중 타이머와 차단을 중단하지 않음

### 8. Premium 계정과 클라우드 동기화

- Chrome 기본 Google 계정 확인과 Supabase PKCE OAuth
- 서버 membership·entitlement를 기준으로 Premium 권한 판정 및 복구
- 최초 연결 시 **이 기기 기록 백업** 또는 **클라우드 기록 복원**을 사용자가 직접 선택
- 일정, 설정, 완료 세션, 리포트, 학습 일자만 최대 365일 동기화
- 로컬 우선 저장, 오프라인 pending mutation, 15분 주기·수동 동기화
- mutation ID 기반 중복 처리 방지, 삭제 tombstone, expected version 충돌 감지
- 충돌 발생 시 자동 덮어쓰기 대신 이 기기 또는 클라우드 버전을 사용자가 선택
- heartbeat 원본, 임시 허용, alarm, DNR rule, 탭 snapshot, AI 임시 이미지는 클라우드에서 제외

### 9. 화면 OCR·문법 교정·핵심 요약 (Premium)

- 현재 일반 웹페이지에서 사용자가 드래그한 visible viewport 영역만 캡처
- 서버 전송 이미지 미리보기, 민감정보 경고, 명시적 동의
- Qwen OCR로 heading·paragraph·list·table·formula block 추출
- OCR 원문을 사용자가 직접 검토·수정한 뒤 AI 작업 실행
- 맞춤법·문법 최소 교정, 자연스러운 윤문, 간결한 윤문
- 교정문, 원문 diff, 변경 유형·이유, 복사, 일반 input·textarea·contenteditable 적용
- 중요 내용 3~5개와 짧은 요약, 불확실 항목, 원문 block 근거 제공
- 개념·용어·기억할 내용을 구조화하는 학습 정리
- OCR 이미지·원문·결과를 기본적으로 영구 저장하지 않음
- 서버가 entitlement와 작업별 rate limit을 확인하고 Groq API key는 Edge Function Secret에만 보관

### 10. 설정, 데이터, 도움말

- 주 UI, 기본 차단 방식, 자리 비움 기준, 알림, heartbeat, 일일 리포트 설정
- 탭 그룹화 실행 시점, 기존 그룹·고정 탭 처리, 교정 기억, 종료 시 복원 정책 설정
- JSON 데이터 내보내기와 확인 절차가 있는 전체 로컬 기록 초기화
- 온보딩 다시 보기, 알림 테스트, 앱 내부 Help
- 멤버십 확인·로그아웃, 클라우드 초기화·동기화·복원·충돌 해결

## 사용 방법

### 1. 처음 설정하기

1. 확장 프로그램을 설치하고 아이콘을 고정합니다.
2. Free 또는 Premium을 선택합니다. Free는 Google 로그인 없이 사용할 수 있습니다.
3. 주 화면으로 Side Panel 또는 Popup을 선택합니다.
4. 테스트 알림, 기본 차단 방식, 자리 비움 기준을 설정합니다.
5. 첫 일정을 만들거나 건너뛴 뒤 Today로 이동합니다.

### 2. 일정 만들고 집중하기

1. **Plan → 일정 추가**에서 일정명, 시작 시각, 목표 집중 시간, 활동 유형을 입력합니다.
2. 집중 방식에 맞춰 Allowlist, Blocklist, Off 중 하나를 고르고 사이트를 등록합니다.
3. Today 또는 Plan에서 **집중 시작**을 누릅니다.
4. Focus에서 타이머와 허용 사이트를 확인하고 필요하면 휴식·일시정지·탭 정리를 사용합니다.
5. 목표 시간이 끝나거나 직접 종료할 때 완료 또는 미완료를 선택하고 확인합니다.
6. Reports에서 집중 시간, 휴식, 미루기, 차단 시도와 달성률을 확인합니다.

### 3. AI 도구 사용하기

1. Premium 로그인과 entitlement를 확인합니다.
2. Side Panel의 **화면 AI 도구**를 열고 분석할 일반 웹페이지에서 영역을 선택합니다.
3. 전송될 이미지를 확인하고 민감정보가 없을 때만 동의합니다.
4. OCR 원문을 검토한 뒤 문법 교정, 핵심 요약, 학습 정리 중 하나를 실행합니다.
5. 결과는 원문 근거와 대조한 뒤 복사하거나 지원되는 입력창에 적용합니다.

AI 결과는 중요한 맥락을 누락하거나 부정확할 수 있습니다. 의료·법률·재무 판단의 단독 근거로 사용하지 마세요.

## 화면 구성

| 화면 | 역할 |
|---|---|
| Today | 현재·다음 일정, 오늘 일정, 빠른 시작, 미루기, 미처리 알림, 달성률 |
| Plan | 일정 생성·수정·삭제, 시간·도메인 검증, 집중 시작 |
| Focus | 타이머, 휴식, 사이트 정책, 집중 상태, 탭 정리·복원, 종료 |
| Reports | 날짜별 지표, 로컬 요약, Premium 월간 학습 잔디 |
| Settings | 멤버십, 클라우드, 집중·알림·탭 설정, 내보내기, 초기화 |
| Help | 사용법, 알림 문제 해결, 개인정보, Chrome 제약 |
| Popup | 현재·다음 일정과 핵심 집중 동작을 빠르게 조작하는 축약 화면 |
| Blocked | 차단 이유, 남은 시간, 허용 사이트, 복귀와 임시 허용 |
| 화면 AI 도구 | 화면 선택, OCR 검토, 교정·요약·학습 정리와 원문 비교 |

## AGENT를 활용한 개발 방식

이 프로젝트는 `AGENTS.md`를 최상위 실행 명세로 두고 Codex와 반복적으로 개발했습니다. 기능 요청을 대화에만 남기지 않고 문서와 코드, 테스트를 함께 확장하는 방식을 사용했습니다.

1. `AGENTS.md`에 제품 원칙, 아키텍처, 구현 순서, 품질 기준, 회귀 방지 규칙을 기록합니다.
2. 규모가 큰 새 기능은 `docs/` 아래에 별도 Markdown 명세를 먼저 작성합니다.
3. 기존 기능을 제거하거나 바꾸기보다 additive change로 새 기능을 하나씩 연결합니다.
4. 공용 타입과 메시지, storage migration, Background 책임을 먼저 정리한 뒤 UI를 붙입니다.
5. 기능 구현 후 관련 문서와 회귀 테스트를 함께 갱신합니다.
6. 마지막에 typecheck, lint, test, build를 모두 실행해 기존 기능이 유지되는지 확인합니다.

현재 추가 기능 명세는 스마트 탭 그룹화, 기존 기능 보호, 멤버십·클라우드·AI 기능처럼 관심사별로 분리되어 있습니다. 이렇게 하면 새로운 AGENT 작업에서도 배경과 완료 기준을 잃지 않고 기능을 계속 붙여 나갈 수 있습니다.

## 아키텍처

```text
UI (Side Panel / Popup / App / Blocked)
  → 공용 타입 메시지
  → Manifest V3 Service Worker
  → repository / chrome.storage.local
  → alarms / notifications / DNR / tabs / tabGroups

Premium 선택 시에만
  → Supabase Auth + RLS + Edge Functions
  → Cloud Sync / Groq OCR·AI
```

- UI 컴포넌트는 `chrome.storage`를 직접 수정하지 않고 공용 메시지를 Background에 보냅니다.
- Service Worker가 상태 전환, 영속화, alarm, badge, DNR 규칙의 최종 책임을 가집니다.
- Service Worker가 계속 실행된다고 가정하지 않으며 모든 핵심 상태는 storage에서 복구합니다.
- Content Script는 페이지 내용이나 입력값을 자동 수집하지 않고 활동 발생 시각과 visibility만 최대 1분 간격으로 전달합니다.
- Premium 서버 실패는 Free 집중 타이머와 차단 기능에 영향을 주지 않도록 격리합니다.

## 기술 스택

- React, TypeScript strict, Vite
- Chrome Extension Manifest V3
- `chrome.storage.local`, `chrome.alarms`, `chrome.notifications`, `chrome.idle`
- `chrome.declarativeNetRequest`, `chrome.tabs`, `chrome.tabGroups`, `chrome.action`, `chrome.sidePanel`, `chrome.identity`
- Supabase Auth, Postgres RLS, RPC, Edge Functions
- Groq Chat Completions, Qwen OCR, GPT-OSS
- Vitest, ESLint

## 프로젝트 구조

```text
.
├─ public/icons/          # 확장 프로그램 및 브랜드 아이콘
├─ src/
│  ├─ background/         # Service Worker, 복구, alarm, DNR, 알림, 리포트
│  ├─ content/            # 활동 heartbeat, 화면 영역 선택, 입력창 적용
│  ├─ popup/              # 축약형 빠른 컨트롤
│  ├─ sidepanel/          # 기본 UI 진입점
│  ├─ app/                # 넓은 확장 프로그램 페이지
│  ├─ blocked/            # 차단·임시 허용 페이지
│  ├─ features/           # 일정, 집중, 탭, 리포트, 멤버십, 동기화, AI, 설정
│  └─ shared/             # 타입, 메시지, storage, 시간, Chrome wrapper, 공용 UI
├─ supabase/
│  ├─ migrations/         # 멤버십·동기화·AI Gate A~D DB migration
│  ├─ functions/          # 멤버십, cloud-sync, ai-writing Edge Functions
│  └─ tests/database/     # RLS·권한·동기화·AI DB 검증 SQL
├─ docs/                  # 기능별 명세, 사용자·개인정보·설계 문서
├─ AGENTS.md              # 최상위 제품·개발·회귀 방지 명세
├─ public/manifest.json   # Manifest V3 설정
└─ vite.config.ts         # Popup, Side Panel, App, Blocked multi-entry build
```

## 설치와 실행

요구 환경은 Node.js 20 이상, npm, Chrome 116 이상입니다.

```bash
npm install
npm run dev
```

`npm run dev`는 UI 개발용 Vite 서버입니다. Chrome에서 실제 확장 기능을 확인하려면 production build를 사용해야 합니다.

```bash
npm run build
```

### Chrome에 로드하기

1. `npm run build`를 실행합니다.
2. Chrome에서 `chrome://extensions`를 엽니다.
3. 오른쪽 위 **개발자 모드**를 켭니다.
4. **압축해제된 확장 프로그램을 로드합니다**를 누릅니다.
5. 프로젝트의 `dist` 폴더를 선택합니다.
6. 확장 아이콘을 고정하고 온보딩을 진행합니다.

코드를 변경했다면 다시 build한 뒤 `chrome://extensions`에서 미루지마를 새로고침해야 합니다.

## Premium 개발 환경

Free 기능은 별도 서버 설정 없이 사용할 수 있습니다. Premium Gate A~D를 연결하려면 `.env.example`을 참고해 `.env.local`을 구성합니다.

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_BILLING_INTEGRATION=deferred
VITE_PREMIUM_MONTHLY_PRICE_LABEL=
```

추가로 다음 작업이 필요합니다.

1. `supabase/migrations/`의 Gate A~D migration을 Supabase에 적용합니다.
2. `activate-membership`, `get-membership-entitlements`, `cloud-sync`, `ai-writing` Edge Function을 배포합니다.
3. Supabase와 Google OAuth redirect를 Chrome Extension ID에 맞게 설정합니다.
4. `GROQ_API_KEY`와 선택적 모델 값은 확장 프로그램이 아니라 Supabase Edge Function Secret에만 저장합니다.
5. 실제 계정 로그인, 다른 기기 복구, 동기화 충돌, OCR·교정·요약, rate limit을 실환경에서 검증합니다.

## 품질 검사

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

- `typecheck`: TypeScript strict 타입 검사
- `lint`: ESLint 정적 검사
- `test`: 도메인·차단·시간·상태·리포트·탭·멤버십 관련 Vitest 실행
- `build`: 타입 검사 후 Chrome에 로드할 `dist` 생성

## 권한과 사용 이유

| 권한 | 사용 이유 |
|---|---|
| `storage` | 일정, 세션, 설정, 최소 이벤트, 탭·동기화 상태의 로컬 저장 |
| `alarms` | 일정·집중 종료·휴식·상태 확인·임시 허용·리포트·동기화 예약과 복구 |
| `notifications` | 일정 시작, 집중 상태, 휴식·종료 등 시스템 알림 |
| `idle` | 사용자가 설정한 기준에 따른 시스템 유휴·잠금 상태 확인 |
| `tabs` | 활성 탭 hostname 확인, 탭 정리, 화면 선택·캡처 흐름 |
| `tabGroups` | 탭 그룹 생성·수정·복원 |
| `identity`, `identity.email` | Premium 선택 시 Chrome 기본 Google 계정 확인과 OAuth |
| `sidePanel` | 기본 UI 표시와 알림 클릭 fallback |
| `declarativeNetRequest` | 집중 중 미허용 main-frame 요청 차단과 리디렉션 |
| `<all_urls>` | 사용자가 정한 임의 도메인 차단, 최소 heartbeat, 사용자가 요청한 화면 영역 선택 |

## 개인정보 원칙

- Free 핵심 기능은 외부 서버 없이 `chrome.storage.local`에서 동작합니다.
- 전체 URL, query, hash, 페이지 본문, 검색어, 폼 값, 실제 키 입력, 클릭 대상 텍스트를 자동 저장하지 않습니다.
- 일반 집중 기록에는 가능한 한 정규화한 hostname과 최소 이벤트만 사용합니다.
- 로컬 활동 이벤트 원본은 기본 30일 보관합니다.
- Premium 동기화는 일정, 설정, 완료 세션 요약, 리포트, 학습 일자만 대상으로 합니다.
- AI는 사용자가 직접 선택하고 미리보기에서 동의한 화면 영역만 처리합니다.
- 선택 이미지, OCR 원문, AI 결과는 기본적으로 영구 저장하지 않습니다.
- 탭 snapshot, heartbeat 원본, 임시 허용, alarm, DNR runtime 정보는 클라우드로 보내지 않습니다.

자세한 내용은 [개인정보 처리 문서](docs/PRIVACY.md)를 확인하세요.

## 현재 제한과 미구현 범위

- 실제 결제, 구독 갱신·해지, Stripe Checkout, Customer Portal은 구현되어 있지 않습니다.
- Premium 코드는 구현되어 있으나 Supabase 배포, Google OAuth, 여러 PC 동기화, Groq AI는 실제 운영 환경 검증이 필요합니다.
- AI는 현재 보이는 화면 영역만 처리하며 전체 페이지 자동 스크롤 캡처는 지원하지 않습니다.
- Google Docs, Notion, CodeMirror 등 복잡한 편집기에 교정문 직접 적용을 보장하지 않습니다.
- `chrome://`, Chrome Web Store 등 제한 페이지는 차단, Content Script, 화면 선택을 지원하지 않습니다.
- Chrome 밖 앱과 다른 브라우저의 사용 내용은 확인하지 않습니다.
- Chrome 또는 운영체제가 알림을 차단하면 시스템 알림을 강제로 표시할 수 없습니다.
- Popup은 Chrome API로 강제 열 수 없어 알림 클릭 시 Side Panel 또는 전체 페이지로 이동할 수 있습니다.
- JSON 내보내기는 지원하지만 현재 JSON 가져오기나 표 변환은 제공하지 않습니다.

## 문서 안내

| 문서 | 내용 |
|---|---|
| [AGENTS.md](AGENTS.md) | 전체 제품 명세, 구현 순서, 품질·회귀 방지 기준 |
| [통합 기능 명세](docs/FEATURE_SPECIFICATION.md) | Free·탭·Premium·Cloud·AI 전체 기능과 구현 상태 |
| [정보 구조도](docs/INFORMATION_ARCHITECTURE.md) | 온보딩·Side Panel·Popup·각 기능 화면의 정보 흐름 |
| [사용자 가이드](docs/USER_GUIDE.md) | 설치부터 일정, 집중, AI 도구까지 실제 사용 순서 |
| [프로젝트 정리](docs/NOTION_PROJECT.md) | 배경, 아키텍처, 개발 과정, 회고용 문서 |
| [개인정보 처리 문서](docs/PRIVACY.md) | 저장·미저장 데이터, 외부 전송, 보존·삭제 정책 |
| [스마트 탭 그룹화 명세](docs/SMART_TAB_GROUPING.md) | 탭 분류, 그룹, snapshot, 복원과 학습 규칙 |
| [멤버십·클라우드·AI 명세](docs/MEMBERSHIP_CLOUD_SYNC.md) | Premium Gate A~D, 인증, 동기화, OCR·교정·요약 |
| [기존 기능 보호 원칙](docs/EXISTING_FEATURE_PROTECTION.md) | 새 기능 추가 시 기존 동작을 지키는 개발 규칙 |
| [ERD](docs/ERD.md) | 로컬 storage와 Supabase 데이터 구조 |

## 한 줄 정리

미루지마는 **계획 → 집중 시작 → 딴짓 차단 → 학습·작업 보조 → 결과 기록**을 Chrome 안에서 하나의 흐름으로 연결한 개인 생산성 프로젝트입니다. 핵심 기능은 로컬 우선으로 지키고, 장기 기록과 AI 기능은 선택적 Premium 구조로 확장했으며, 실제 결제 연동은 다음 단계로 남겨 두었습니다.
