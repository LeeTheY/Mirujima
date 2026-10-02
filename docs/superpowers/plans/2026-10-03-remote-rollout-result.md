# 2026-10-03 원격 반영 및 PR 검증 결과

## 범위와 상태

유료 Supabase 검증 환경은 생성하지 않았다. 기존 `qhueocvatlgaoupokgmc` 프로젝트에 필요한 migration과 Edge Function을 적용했다. Vercel CLI는 로그아웃 상태를 유지하며 production Web 교체·live Toss 전환·PR 병합은 하지 않았다. 이번 결과는 코드 및 기존 원격 테스트 환경 검증이며 실제 금융 출시 승인이 아니다.

## 수정 및 원격 적용

- 환불 제공자 요청 전 지원 불가가 확정되면 잠금 RPC로 예약을 반환한다. 이미 dispatch한 불명확한 요청은 예약을 보존한다.
- legacy cloud sync가 canonical 집중 projection과 재시작 차단 규칙을 덮어쓰거나 삭제하지 못하게 했다.
- `apply_cloud_mutation`이 직접 멤버십과 가족 상속 entitlement의 유효 기간·enabled 상태를 모두 검증한다.
- 기존 결제 키가 있는 불명확한 실패 멤버십 주문은 제공자 조회만 허용한다. 검증된 DONE만 멤버십·가족 좌석에 한 번 반영한다. 취소·만료·미결합 실패 주문은 차단한다.
- 지갑 역할은 사용자 인증 client와 기존 자기 profile RLS로 조회한다. 학생에게 보호자 전용 환불 RPC를 호출하지 않는다. 원격 단독 재배포 후 학생·보호자 모두 HTTP 200 및 정수 잔액 계약을 확인했다.

원격 적용 migration은 `202610020003`, `0006`, `0007`, `0010`, `0011`, `0012`, `0017`, `0018`, `202610030001` 9개다. 로컬과 원격 전체 50개 migration 이력이 일치하고 원격 DB lint는 오류가 없다.

Edge Function 13개를 JWT 검증 ON으로 배포했다: `membership-create-order`, `membership-confirm-payment`, `wallet-create-topup-order`, `wallet-confirm-topup`, `wallet-refund-topup`, `wallet-summary`, `cashout-request`, `cloud-sync`, `get-membership-entitlements`, `ai-writing`, `family-link-issue`, `family-link-redeem`, `notification-push-dispatch`.

배포 응답과 실제 소스가 달랐던 결제 함수 6개는 단독 재배포했다. 최종 원격 함수 및 공유 소스 25개 파일이 로컬 커밋 소스와 일치함을 대조했고 학생·보호자 현금화 요청이 HTTP 503 `cashout_unavailable`로 차단됨을 확인했다.

`TOSS_PAYMENT_MODE=test`, `MIRUJIMA_LIVE_PAYMENTS_ENABLED=false`를 명시했다. 실제 제공자 환불 검증 전이므로 환불 모드는 미설정으로 유지하고 요청을 차단한다. 현금화 신청·자동 지급은 차단 상태다.

## 실행 검증

- `npm run verify:local`: Vitest 493개, root/Web lint·타입 검사·production 빌드, 공개 번들 비밀 검사 통과. 이후 지갑 역할 조회만 최소 수정했으며 관련 테스트 3개·lint·독립 검토 및 원격 양쪽 200을 다시 확인했다.
- 네이티브 로컬 PostgreSQL/pgTAP: 36개 파일, 705개 assertion, 실패 0. Docker가 없어 동일 SQL을 로컬 PostgreSQL에서 실행했다. GitHub CI는 공식 Supabase stack의 DB 검증을 별도로 실행한다.
- `npm run test:e2e:public:web`: 공개 UI 51개 통과.
- 실제 기존 Auth 학생 상태: 공개 51개와 학생 인증 4개 통과. 보호자 인증: 3개 통과, 학생 전용 기록 검사는 의도적으로 1개 제외.
- `npm run verify:browsers`: Dialog 포커스·중첩 Escape, production SW 오프라인·민감 URL 미캐시·명시적 업데이트, Chromium MV3 smoke 9개 통과. 마지막 production 확장 빌드와 비밀 검사도 통과.
- 기존 표시된 전용 테스트 계정으로 실제 Supabase 여정 14개 확인: Auth, 학생 raw profile RLS, Edge 연결 코드 발급·사용, AI 기본 OFF·동의·철회, 0P 차단 off 계획·집중 시작, 조기 성공 거부, 소유권 차단, 서버 시간 이후 성공, 중복 완료, 연결 해제. 실제 지급이나 결제 제공자 호출은 없다.
- 전체 raw diff 독립 통합 검토와 마지막 지갑 RLS 수정의 독립 검토 완료. 코드 리뷰는 실제 금융·기기 검증을 대신하지 않는다.

## 남은 출시 게이트

실제 Toss 인증·승인·부분 취소·응답 유실 복구와 제공자 거래/원장 대조, 실제 Google OAuth, 기존 설치 Chrome 호환, 실제 기기 PWA Push·VAPID/scheduler, DB 복원 연습은 미완료다. `verify:release:evidence`의 7개 실환경 gate를 통과했다고 표시하지 않는다. 테스트 키를 live 키로 교체하는 것만으로 출시 준비가 완료되지는 않는다.

사용자 전체 데이터 백업은 자동 승인 검토에서 거절되어 추출하지 않았다. schema-only 전체 dump도 Docker 부재와 DB 권한 제한으로 실패했다. 대안으로 사용자 행과 자격 증명이 없는 기존 public SQL 함수 정의만 보호된 로컬 임시 파일에 보관했다. 진행 중 작업 전체 건수 조회는 권한 제한으로 확인하지 못했다. 적용 migration은 기존 행의 일괄 수정·삭제를 하지 않는다.

과거 단계 문서의 원격 보류 기록은 당시 상태이며, 현재 원격 상태는 이 문서가 대체한다. 최신 Web/Extension 배포 및 실제 제공자 게이트 완료 전에는 출시 후보 검증용 PR로 취급한다.

## GitHub 및 Preview

새 브랜치 `feat/v3-release-readiness`, Draft PR #3을 생성했다. Vercel Preview 빌드는 READY이며 실제 공개 화면과 미인증 집중 페이지의 로그인 복귀 주소를 확인했다. 최초 GitHub CI의 공식 Supabase DB 검사와 493개 단위·타입·빌드 검사는 통과했다. 공개 E2E는 Supabase 환경변수가 없는 CI에서 로그인 폼이 생성된다고 가정한 검사 1개가 실패했다. 설정 없는 상태의 명시적 안내와 설정 있는 상태의 목적지 form을 구분하도록 검사만 수정했다. 제품 인증 경계는 변경하지 않았다. 최신 CI 결과는 PR Checks를 따른다.
