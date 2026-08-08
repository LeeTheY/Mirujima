# Web·Chrome Extension 책임 재배치 설계

## 목표

웹에 이미 제공되는 사용자 관리 화면과 계획·기록 화면은 웹을 기본 진입점으로 일원화하고, Chrome Extension은 브라우저에서만 가능한 집중 실행·차단 에이전트로 축소한다.

## 유지해야 하는 Extension 책임

- Manifest V3 service worker
- DNR allowlist/blocklist 적용과 해제
- `chrome.alarms` 기반 종료 시점 유지
- 브라우저 재시작 후 active session 복구
- `chrome.idle` 및 필요한 활동 상태 감지
- 차단 안내 화면
- Chrome system notification
- Web external messaging, Supabase canonical session 재조회, resync
- Chrome API가 필요한 탭 정리 기능

## Web으로 일원화할 책임

- 로그인 이후 계정/역할/온보딩 관리
- 집중 계획 작성과 편집
- 기록과 통계 열람
- 멤버십, 지갑, 가족 연결, AI 기능
- 클라우드 설정의 사용자 편집 UI

## Extension의 최종 사용자 화면

Popup/Side Panel은 다음 상태만 간결하게 제공한다.

- 로그인 또는 웹 로그인 안내
- 웹에서 준비된 현재 집중 세션
- 시작/일시정지/재개/포기 등 서버 상태 머신이 허용하는 제어
- 남은 시간, 차단 상태, 동기화 상태
- 웹 앱 열기
- Chrome 전용 탭 정리 진입

Extension에서 계획 생성, 전체 기록, 계정·멤버십·가족·지갑 설정을 중복 제공하지 않는다.

## 마이그레이션 원칙

1. 기존 기능을 화면, 상태, 저장소, Chrome API 의존성 단위로 목록화한다.
2. 각 항목을 `extension-only`, `web-primary`, `shared-contract`로 분류한다.
3. Web에서 동일 기능과 데이터가 실제로 동작하는 항목만 Extension UI에서 제거한다.
4. 배경 모듈과 공유 모델은 UI 제거와 동시에 삭제하지 않는다.
5. 로컬 저장 schema를 삭제하거나 변경하면 migration을 제공한다.
6. Extension 미설치 또는 서버 장애 시 기존 local enforcement 복구 경로를 보존한다.

## 검증

- Extension build와 manifest 검증
- background timer/DNR/alarm 단위 테스트
- Web↔Extension message contract 테스트
- 활성 세션 복구 테스트
- 제거한 화면의 기능이 Web에서 접근 가능한지 route 테스트
- 번들에서 서버 secret과 Toss secret이 없는지 확인

