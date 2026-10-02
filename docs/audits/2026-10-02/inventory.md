# Mirujima 기능·UI/UX 현황 — 2026-10-02

기준: `feat/complete-v3-release-flow`, `c75f606`. 이 문서는 코드 조사, 로컬 실행, 공개 화면 관찰을 결합한 평가다. 운영 DB·인증 후 화면·실제 Extension 통합을 모두 검증했다는 뜻은 아니다.

## 조사 범위와 판정

- 추적 파일 417개: Extension `src` 88개, Web 163개, packages 8개, migrations 31개, Edge Functions 영역 25개, SQL 테스트 17개, docs 43개. 이번 보고서 생성 전 집계다.
- Web `page.tsx` 27개에는 intercept modal 5개가 포함된다. 독립 URL은 22개다.
- 공개 `/`, `/login`, `/how`, `/privacy`, `/offline`을 실제 Chromium에서 실행했다. 6 viewport, 48개 관찰 이미지, 288개 평가 행을 확인했다.
- 인증 후 학생·보호자 화면은 코드와 단위 테스트로 조사했다. 실제 로그인 계정으로 UI를 조작하지 않았다.
- **구현 기반**은 코드 경로가 있다는 뜻이다. **부분 구현**은 누락·불일치가 확인된 상태다. **미검증**은 코드 부재와 다르다. **의도적 제한**은 출시 정책상 유지할 수 있다.

## 기능 행렬

| 영역 | 상태 | 확인한 기반 | 누락·문제·다음 검증 | 계획 |
|---|---|---|---|---|
| Web/Extension/공유 계약 | 구현 기반 | npm workspaces, Next Web, root Vite Extension, contracts | domain/config 분리는 필요할 때만; root Extension은 명세상 허용 | W00 |
| Google 로그인·온보딩 | 부분 구현 | Supabase SSR, OAuth callback, role route 보호 | callback 오류 표시·원래 목적지 복귀 부족; 실제 로그인 미검증 | W04 |
| 학생 홈·마이페이지 | 부분 구현 | profile/wallet 일부 연결 | 달성률·성과·일부 관계 표시가 고정값 | W05 |
| 계획 입력 | 부분 구현 | 서버 plan upsert, 목표·차단 설정 | 선택 날짜가 저장에 반영되지 않음; 초안/목록/편집 흐름 부족 | W06 |
| 집중 시작·재개·종료 | 부분 구현 | canonical RPC, Realtime, 종료 정산 | 차단 적용 전 active; Extension 부정 응답 미처리 | W02 |
| Extension 차단·복구 | 구현 기반/실기 미검증 | DNR, alarm, storage, bootstrap, 주기 resync, 재정산 queue | 브라우저 종료·SW 종료·계정 불일치·오프라인 재현 필요 | W07 |
| legacy cloud sync | 위험 경로 확인 | entitlement/version 기반 동기화 | 범용 RPC가 canonical session payload를 갱신 가능; 별도 DB 재현 필요 | W01 |
| 집중 결과·deposit | 부분 구현/정책 차이 | ledger posted/reserve, 목표별 정산 | v3 성공/실패 정책과 현재 단계별 전환율이 다름 | W00,W06 |
| 연결 코드 | 구현 기반/통합 미검증 | hash, 역할, 만료·발급·redeem 관련 SQL/테스트 | 5분/재발급/실패 잠금/rate limit 동시성 테스트 | W08 |
| 연결 해제 | 미완성 | 확인 모달 | 양쪽 최종 버튼은 창/선택만 닫음; 해제 RPC 미발견 | W03 |
| 보호자 공유 설정 | 미완성 | DB 공유 필드, aggregate 권한 경계 | UI 토글은 local state; 저장 버튼은 닫기만 수행 | W03 |
| 보호자 홈·학생 선택 | 부분 구현 | 연결 학생·집계 로더 | 홈 안내·마이페이지 지표 고정, 코드 입력 안내와 도착 화면 불일치 | W05,W08 |
| 보호자 보상 | 부분 구현 | 요청·승인·거절·정산 RPC/화면 | 요청금액 2,000P 고정; 승인 시점 정책 차이; 동시성 미검증 | W08 |
| 지갑 잔액·거래 | 부분 구현 | ledger 집계, wallet-summary | 조회 오류를 0P로 표시 | W09 |
| 충전·멤버십 결제 | 테스트 구현 | 공식 Toss SDK, 테스트 승인, 주문/금액 검증 | live 계약/운영 검증 미완료; Widget 요구 충족 여부 결정 | W10 |
| topup 환불 | sandbox | reserve/complete 경로 | 취소 응답을 sandbox로 생성; 실제 Toss 취소 API 미호출 | W10 |
| earned 현금화 | 의도적 제한 | sandbox 요청·상태 | 실제 지급 미구현은 출시 gate; 검증 전 자동 지급 유지 금지 | W10 |
| 멤버십·entitlement | 구현 기반 | 서버 권한 확인·상품 설정 | 정기 Billing 미제공은 계약 전 정상; 만료·취소 통합 검증 | W10,W13 |
| AI 코칭·요약 | 구현 기반/실서비스 미검증 | ai-writing 확장, entitlement/rate limit, 입력·출력 검증 | 모델 운영·한도 UX·동의 철회·실패 복구 검증 | W13 |
| 기록·통계 | 부분 구현 | 일/주/월, 요약·막대·표, guardian aggregate | 목표별 시간/연속일/디파짓전환/차단시도/시간대 등 요구와 대조 | W12 |
| 알림 | 부분 구현 | in-app, 읽음 RPC, pagination, realtime; Extension 알림 | PWA push·구독·알림 클릭·채널 중복 제어 미구현 | W14 |
| PWA | 부분 구현/실기 미검증 | manifest, SW, 제한적 cache, register | 설치·업데이트·실제 offline 미검증; 모바일 차단 가능 범위 안내 | W14 |
| 공개 UI | 부분 구현 | 네이비/블루, 카드, 기존 브랜드 | 모바일 3열 붕괴, header 줄바꿈, 상세 페이지 CSS 누락 | W11 |
| 접근성 | 부분 구현 | PaymentOverlay keyboard/focus 구현 | 다른 모달·토글·현재 nav 상태 일관성 부족 | W11 |
| 개인정보 설명 | 불일치 | 보호자 aggregate 제한 | ‘수집하지 않음’ 표현과 사용자 실행 OCR/탭 기능 범위가 다름 | W03 |
| 자동 검증·운영 | 부분 구현 | Vitest/Playwright/pgTAP/번들 검사 | 인증 skip 허용, 문서 env 이름 불일치, 저장소 CI 미발견, 운영 관측 미검증 | W00,W15 |

## 실행 결과

| 실행 | 결과 | 해석 |
|---|---|---|
| `npm test` | 58 files / 232 tests 통과 | Web unit 일부가 포함되어 아래 결과와 합산하지 않음 |
| `npm run test --workspace @mirujima/web` | 27 files / 86 tests 통과 | Web 설정으로 별도 재확인 |
| root/Web typecheck·lint | 통과 | 런타임 기능 완성의 증명은 아님 |
| Extension/Web production build | 모두 통과 | 외부 서버·provider 통합은 미검증 |
| `npm run test:e2e:web` | 18 통과 / 3 skip | 인증 storage state 미제공. 초기 browser 설치 오류 후 재실행 결과 |
| `npm run security:scan-public` | 58 files 통과 | 정해진 비밀 패턴 검사이며 전체 보안 감사가 아님 |
| frontend-harness assess | 평가 완료, 기준 미달 | 평균 7.44/10, 기준 미달 평가 행 99개 |
| pgTAP·운영 DB·Toss·실제 MV3 | 실행하지 않음 | 과거 문서의 통과 기록을 현재 결과로 인용하지 않음 |

## 시각 평가

| viewport | 점수 | 주요 관찰 |
|---|---:|---|
| 320×800 | 7.00 | header 글자 분절, 3단계 카드가 매우 좁음, login 제목 고립 글자 |
| 390×844 | 7.23 | 단계 카드 3열 유지, CTA 전 설명량 많음 |
| 844×390 | 7.42 | 낮은 높이에서 login 핵심 행동까지 scroll 필요 |
| 768×1024 | 7.67 | 공개 상세 페이지 공통 컨테이너·간격 부족 |
| 1440×900 | 7.67 | landing/login 구조는 유지 가치; 상세 페이지 여백 부족 |
| 1920×1080 | 7.67 | how/privacy 최대 폭·열 구조 누락이 더 뚜렷함 |

48개 관찰에서 수평 overflow와 시나리오의 URL·클릭 단언은 통과했다. 그러나 overflow가 없다고 읽기 좋은 것은 아니다. 320px의 한 글자씩 줄바꿈이 대표적이다.

필수 검사 실패 2건은 `/#how`, `/#privacy` anchor가 harness inventory에 등록되지 않은 **검증 범위 구성 문제**다. 앱 기능 실패 2건으로 계산하지 않는다. 다음 실행에서는 anchor 상태를 등록하고 결과를 다시 평가한다. 7.44점은 지정한 공개 화면의 평가이며 제품 전체 점수가 아니다.

`/offline`은 온라인 상태에서 직접 방문했다. 실제 서비스 워커 offline 복구를 통과했다고 해석하지 않는다. 48개 PNG를 모두 시각 확인했으며 수정 전후 비교는 아직 없다.

## 증거 보관

실행 로그·PNG·trace는 공개 저장소 밖에 보관한다. 인증 세션·secret을 문서에 포함하지 않는다. 후속 인증 평가에서도 storage state와 개인정보가 있는 trace를 커밋하지 않는다.

- [하네스 원본 보고서](/Users/ldy/.codex/visualizations/2026/10/02/01a0fb93-cf0c-7ca3-bd07-7700d1ce9f00/mirujima-audit/public-run/summary.md)
- [화면별 검증 범위](/Users/ldy/.codex/visualizations/2026/10/02/01a0fb93-cf0c-7ca3-bd07-7700d1ce9f00/mirujima-audit/public-run/reports/screen-coverage.md)
- [실행 로그 폴더](/Users/ldy/.codex/visualizations/2026/10/02/01a0fb93-cf0c-7ca3-bd07-7700d1ce9f00/mirujima-audit)
- [코드 근거 색인](source-evidence-index.md)
