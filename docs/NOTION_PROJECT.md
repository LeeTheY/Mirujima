# 미루지마 (Mirujima)

> 계획한 시간과 사이트를 실제 행동으로 연결하는 로컬 우선 Chrome 집중 보조 확장 프로그램

## 프로젝트 배경

할 일을 적는 도구는 많지만 계획 시각이 왔을 때 브라우저 행동을 실제로 바꾸는 도구는 적다. 미루지마는 일정 알림에서 끝나지 않고 집중 세션 동안 계획에 없는 사이트 접근을 브라우저 단계에서 막고, 완료 결과를 하루 기록으로 남긴다.

## 해결하려는 문제

- 계획을 작성해도 시작 시각에 행동으로 전환하지 못함
- 무의식적으로 방해 사이트를 열고 긴 시간을 소비함
- 자리 비움과 반복 미루기를 하루가 끝난 뒤 기억하지 못함
- 감시형 생산성 도구의 과도한 데이터 수집에 대한 불신

## 서비스 소개와 주요 사용자

미루지마는 학습, 개발, 문서 읽기, 강의 시청, 오프라인 작업을 계획하는 사용자에게 적합하다. 사용자가 일정별 허용/차단 hostname을 정하면 시작 알림, 집중 타이머, 실제 사이트 차단, 상태 확인, 리포트를 제공한다. 페이지 내용이나 입력값은 수집하지 않는다.

## 핵심 기능

1. Side Panel/Popup 선택이 포함된 7단계 온보딩
2. 일정 CRUD, 시간 겹침 검증, 활동 유형, 5분 미루기
3. 지속 가능한 storage 기반 집중 세션 상태 머신
4. DNR session rule 기반 Allowlist/Blocklist 실제 차단
5. 이유와 만료가 기록되는 긴급 임시 허용
6. idle, 탭, visibility, heartbeat, 차단 시도의 조합 판단
7. 시스템 알림·배지·앱 경고·차단 페이지의 다중 채널
8. 최근 30일 Free 리포트와 Premium 365일 학습 잔디·연속 학습
9. Premium 초기 백업/복원, 오프라인 queue, 버전 충돌·tombstone 동기화
10. Premium 화면 선택, Qwen OCR, GPT-OSS 문법 교정·윤문과 입력창 적용
11. OCR block 근거 기반 핵심 요약·학습 정리와 불확실성 표시
12. JSON 내보내기, 전체 삭제, 앱 내부 도움말

## 사용자 흐름

`온보딩 → 오늘 일정 생성 → 시작 알림 → 집중 시작 → DNR 차단 활성화 → 상태 확인/임시 허용 → 완료 또는 미완료 종료 → 일일 리포트`

일시정지하면 차단 규칙을 제거하고 재개하면 storage를 기준으로 다시 만든다. Chrome이나 Service Worker가 재시작되면 bootstrap이 저장된 일정·세션을 읽어 alarm, badge, DNR 규칙을 idempotent하게 복구한다.

## 화면 구성

- **Today**: 현재/다음 일정, 빠른 시작, 미루기, 오늘 달성률
- **Plan**: 일정 생성·수정·삭제와 도메인 검증
- **Focus**: 타이머, 허용 사이트, 일시정지·재개·종료
- **Reports**: 달성률, 집중 시간, 방해·유휴 기록
- **Settings**: UI, 차단·알림, 내보내기, 초기화
- **Help**: 설치부터 개인정보까지 사용자 중심 설명
- **Popup**: 현재/다음 일정과 핵심 동작만 축약
- **Blocked**: 차단 이유, 남은 시간, 복귀, 임시 허용

## 기술 스택

- React + TypeScript strict + Vite
- Chrome Manifest V3
- `chrome.storage.local`, `chrome.alarms`, `chrome.notifications`, `chrome.idle`, `chrome.tabs`
- `chrome.declarativeNetRequest`, `chrome.action`, `chrome.sidePanel`
- Vitest + ESLint

Free 핵심 기능에는 외부 상태 관리나 백엔드가 필요하지 않는다. Premium Gate A~D는 Supabase Auth, RLS, Postgres RPC, Edge Functions를 사용하며 사용자가 Premium을 선택한 경우에만 연결한다. 분석 SDK는 사용하지 않는다.

## 아키텍처

UI는 공용 discriminated union 메시지를 보내고 Service Worker가 모든 영속 변경을 처리한다. repository는 기본값, schema migration, storage 구독, 30일 이벤트 정리를 담당한다. Content Script는 최종 상태를 판단하지 않고 debounce된 활동 시각과 visibility만 보낸다.

Service Worker는 계속 살아 있다고 가정하지 않는다. 장기 예약은 모두 `chrome.alarms`, 현재 상태는 storage, 차단은 재구성 가능한 DNR session rules에 둔다. 타이머는 매초 저장하지 않고 시작 시각과 누적 초로 계산한다.

Gate B는 local-first 변경 뒤 pending mutation을 쌓고 `cloud-sync` Edge Function이 entitlement, device, mutation idempotency, expected version을 검사한 뒤 계정별 table에 반영한다. 최초에는 사용자가 이 기기 백업 또는 cloud 복원을 선택해야 하며, 이후 15분 alarm과 수동 동기화를 사용한다. 삭제는 tombstone으로 전달하고 충돌은 자동 덮어쓰기하지 않는다.

Gate C는 content script의 선택 overlay가 viewport CSS 좌표만 반환하고 Service Worker가 `captureVisibleTab` 결과 크기에 맞춰 crop한다. crop 이미지는 Side Panel preview 동의 뒤에만 `ai-writing` Function으로 보내며, 서버가 entitlement와 분당 한도를 검사한다. Qwen OCR 원문을 사용자가 검토한 뒤 GPT-OSS strict JSON Schema 결과를 diff, 복사, 일반 입력창 적용에 사용한다. 이미지와 원문·결과는 기본 저장하지 않는다.

Gate D는 Qwen OCR을 문단·표·목록 block으로 구조화하고 stable한 `b1` 형식 ID를 부여한다. GPT-OSS 요약·학습 정리의 모든 핵심 항목과 section은 하나 이상의 유효한 block ID를 참조해야 하며, 3~5개 핵심 내용 범위와 불확실 항목을 runtime에서 다시 검증한다. 결과는 저장하지 않고 복사와 원문 block 이동만 제공한다.

## 차단 설계

Allowlist는 http/https main-frame 요청 전체를 redirect하되 허용 hostname과 활성 임시 허용을 제외한다. Blocklist는 지정 hostname만 redirect한다. redirect 정규식은 원본 URL 전체 대신 hostname 캡처만 차단 페이지 query로 전달한다. 고정 rule ID 대역을 사용하고 적용 전 기존 세션 규칙을 제거한다.

차단 이벤트에는 schedule/session ID, 정규화 hostname, 시각만 기록한다. 임시 허용에는 1분, 5분, 이번 세션과 사용 이유를 요구하며 만료 alarm 후 규칙을 다시 만든다.

## 알림과 집중 상태 설계

1분 주기의 focus-check alarm이 최신 storage를 읽는다. 활동 유형에 따라 interactive 5분, reading 15분, watching 45분 기준을 사용하고 offline은 Chrome 활동량을 판단에서 제외한다. idle은 즉시 away, 반복 차단/미허용 탭은 distracted, 낮은 활동은 needs-check로 분류한다. 같은 종류·세션 알림에는 cooldown을 둔다.

OS 알림을 강제할 수 없으므로 시스템 알림, action badge, 앱의 처리 가능한 알림 목록, 차단 페이지를 함께 사용한다. 목표 시간이 끝나면 세션은 결과 선택 대기로 전환해 시간과 차단을 멈추고 완료/미완료 입력을 기다린다. 휴식은 권장 시간을 alarm 기준으로 사용하되 자동 종료하지 않으며, 초과 시간을 포함한 실제 휴식량을 별도로 누적한다.

## 데이터와 개인정보

모든 기본 데이터는 먼저 Chrome 로컬 저장소에 있다. 전체 URL, query, 페이지 본문, 검색어, 폼 값, 실제 키 입력, 클릭 대상 텍스트는 저장하지 않는다. Chrome 밖 앱 활동을 안다고 표현하지 않는다. 이벤트 원본은 30일이며 Premium cloud에는 일정·설정·완료 세션 요약·리포트·학습 일별 집계만 최대 365일 보관한다.

## 개발 과정

1. 빈 폴더에서 Vite multi-entry와 Manifest V3 기반 구성
2. 공용 모델, 메시지, storage migration, 시간·도메인 순수 함수 작성
3. 온보딩과 공용 UI shell, Side Panel/Popup/App 연결
4. 일정·집중 상태 변경을 Service Worker로 집중
5. DNR 차단, 차단 페이지, 임시 허용 구현
6. idle/heartbeat/탭 조합 상태 확인과 다중 알림 추가
7. idempotent report와 문서·테스트 마감
8. Gate A 계정·entitlement와 Gate B 학습 잔디·cloud sync 추가
9. Gate C 화면 선택 OCR·문법 교정과 서버 rate limit 추가
10. Gate D 근거 기반 핵심 요약·학습 정리와 task별 rate limit 추가

## 테스트

단위 테스트는 도메인 정규화·서브도메인·Allowlist/Blocklist, DNR 생성, 시간·자정, 집중 상태 머신, FocusHealth, 리포트/달성률, 학습 강도·연속 일수, snooze 경고, 알림 cooldown, 임시 허용 만료, migration과 report idempotency를 검증한다. Supabase SQL 테스트는 RLS, 권한, mutation idempotency와 version conflict를 검증한다.

최종 품질 게이트는 다음 네 명령이다.

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## 개선 방향

- Chrome 실기기 E2E 자동화와 DNR/notification 통합 테스트 확대
- 주간 비교와 달력 상세 상호작용 강화
- 선택적 도메인별 사용 시간 집계(개인정보 원칙 유지)
- 설정 export/import와 schema migration 버전 추가
- 접근 제한 페이지에 대한 더 명확한 UX

## 스마트 탭 그룹화 구현

- 로컬 점수 기반 분류: 일정 허용/차단 도메인, 작업 탭 세트, 일정별·전역 사용자 규칙, 휴식 중 생성, 공용 사이트 메타데이터, 일정 키워드, opener 관계 순서로 판정
- Background 조율: snapshot 생성 후 현재 활성 창에만 그룹을 만들며 항목별 실패를 격리
- 집중 연결: 기존 집중 시작·재개와 DNR 처리가 확정된 뒤 자동 정리를 호출하므로 탭 API 실패가 핵심 집중 기능을 중단하지 않음
- 사용자 통제: 자동화 옵션, 사용자 그룹·고정 탭 보존, 수동 정리, 분류 수정 기억, 작업 세트 저장, 종료 시 복원 정책
- 개인정보: Free는 외부 요청 없음, Premium Gate B는 구조화 기록만 Supabase 동기화, heartbeat·본문·검색어·입력값 전송 없음

## 회고 작성용 섹션

### 잘된 점

- 

### 어려웠던 점

- 

### 기술적 판단과 이유

- 

### 다음 버전에서 바꿀 점

- 
