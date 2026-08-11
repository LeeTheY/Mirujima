# 미루지마 (Mirujima)

> 학생의 집중 계획부터 Chrome 사이트 차단, 학습 기록, 보호자 보상까지 연결하는 Web/PWA + Chrome Extension 집중 지원 플랫폼

미루지마는 Web에서 집중 계획과 계정·가족·포인트를 관리하고, Web 페이지를 닫은 뒤에도 Chrome Extension이 타이머와 사이트 차단을 유지하도록 설계되어 있습니다. Chrome이 재시작되면 저장된 종료 시각과 로컬 상태를 기준으로 세션을 복구하며, Supabase는 인증, 역할, 집중 세션, 가족 연결과 재무 원장의 기준 데이터를 관리합니다.

## 현재 구현 상태

저장소는 v3 아키텍처로 전환 중입니다. 아래 상태는 현재 코드와 설정을 기준으로 구분했습니다.

| 영역 | 현재 구현 | 상태 |
|---|---|---|
| Web/PWA | 랜딩, Google OAuth, 학생·보호자 역할 선택, 역할별 보호 라우트, 학생·보호자 대시보드 | 구현 |
| 집중 시작 | Web 계획 검증 → Supabase 계획·세션 RPC → Extension 연결 확인 및 동기화 | 구현 |
| Chrome 실행 에이전트 | 집중 타이머 제어, DNR 사이트 차단, alarm·storage 복구, 활동 상태 확인, 탭 그룹화 | 구현 |
| 학생·보호자 연결 | 보호자 6자리 코드 발급·취소, 학생 코드 입력, 5분 만료, 단일 사용, 실패 잠금 | 구현 |
| 포인트 충전 | Toss 테스트 결제 주문·승인, 멱등 처리, `wallet_transactions` 원장 반영 | 테스트 모드 구현 |
| 멤버십 | 학생 9,900원·보호자 가족 12,900원, 추가 좌석 일할 결제, 서버 entitlement 판정 | 테스트 모드 구현 |
| earned 포인트 현금화 | 요청·완료·거절 원장 상태 재현 | 샌드박스 구현 |
| 기록·통계 | 학생·보호자 화면과 필터·차트 UI | 부분 구현 — 실제 집계 데이터 연결 필요 |
| 알림 센터·공유 설정 | UI와 기본 개인정보 설정 | 부분 구현 — Supabase 알림·설정 저장 연결 필요 |
| AI 추천·가족 요약 | 학생 집중 계획 AI 추천, 보호자 동의 집계 가족 요약, effective entitlement 검증 | 구현 |
| 운영 배포 | Vercel, Supabase, OAuth, Toss 운영 계약 및 실결제 | 확인 필요 |

결제와 현금화 코드는 현재 `TOSS_PAYMENT_MODE=test`를 전제로 합니다. 실제 자동 현금화, 정기결제, 운영 포인트 지급은 활성화되어 있지 않습니다.

## 제품 구성

```text
Web / PWA (Control Plane)
  ├─ Google 로그인과 역할별 화면
  ├─ 집중 계획과 기록
  ├─ 학생·보호자 연결
  └─ 지갑·멤버십·결제
          │
          ├─ Supabase Auth / RLS / RPC / Edge Functions
          │    └─ canonical plan, session, family link, ledger
          │
          └─ Chrome external messaging
                 ↓
Chrome Extension (Browser Enforcement Agent)
  ├─ canonical session 재조회와 소유권 검증
  ├─ DNR 사이트 차단
  ├─ timer / alarm / local recovery
  └─ idle·activity 확인과 탭 그룹화
```

Web 메시지만으로 차단을 시작하지 않습니다. Extension은 허용된 origin, 메시지 스키마, 로그인 사용자와 Supabase의 canonical 세션을 다시 확인한 뒤 로컬 상태와 DNR 규칙을 적용합니다.

## 주요 사용자 흐름

### 학생

1. Google로 로그인하고 학생 역할을 선택합니다.
2. `/focus`에서 목표 시간, 휴식, 차단 방식과 도메인을 입력합니다.
3. 차단을 사용하는 경우 Extension 연결과 로그인을 확인합니다.
4. 서버가 계획과 집중 세션을 확정하면 Extension이 동일 세션을 조회해 타이머와 차단을 시작합니다.
5. 진행 중인 세션은 Popup 또는 Side Panel에서 일시정지·재개·종료하고, 계획·기록·지갑 관리는 Web에서 이어갑니다.

### 보호자 연결

1. 보호자가 마이페이지에서 6자리 연결 코드를 발급합니다.
2. 학생이 5분 안에 코드를 입력합니다.
3. Edge Function과 RPC가 역할, 만료, 중복 연결과 실패 횟수를 검증합니다.
4. 연결된 보호자는 학생이 동의한 집계 정보만 조회하는 방향으로 구성됩니다.

### 포인트 충전

1. Web이 인증된 Edge Function에 충전 주문 생성을 요청합니다.
2. Toss Payments SDK가 테스트 결제창을 엽니다.
3. 성공 callback이 결제 키·주문 ID·금액을 서버로 전달합니다.
4. 서버가 저장된 주문과 Toss 응답을 검증한 뒤 posted 원장 거래를 한 번만 기록합니다.

포인트 화면의 잔액은 하드코딩 숫자가 아니라 `wallet_transactions`의 `posted` 거래를 버킷별로 합산한 결과입니다. 집중 계획을 시작하면 학생이 건 충전 포인트는 `topup → reserved`로 예약되고, 완료 결과에 따라 다음처럼 정산됩니다.

| 완료 결과 | 획득 포인트 | 충전 포인트 반환 |
|---|---:|---:|
| 100% | 걸어둔 포인트의 100% | 0% |
| 80% | 걸어둔 포인트의 80% | 20% |
| 60% | 걸어둔 포인트의 60% | 40% |
| 실패 | 0% | 100% |

정산은 append-only 원장에 기록되며 같은 세션 완료 요청이 반복되어도 한 번만 반영됩니다.

### 역할별 멤버십과 가족 AI

멤버십은 자동 갱신이 없는 30일 단건 상품입니다. Toss Payments 테스트 결제가 승인되면 `membership_payment_orders` 주문이 `confirmed`로 전환되고, `memberships`에 상품·활성 상태·시작일·만료일·좌석 수가 저장됩니다. `membership_entitlements`에는 직접 결제 사용자의 기능별 권한과 만료일이 저장됩니다.

| 상품 | 가격 | 포함 기능 |
|---|---:|---|
| 학생 Premium | 9,900원/30일 | 집중 계획 AI 첨삭, 목표 분할·학습 추천, OCR·문법 교정·콘텐츠 요약 |
| 가족 Premium | 12,900원/30일 | 학생 2명의 학생 AI 기능 + 보호자 가족 AI 요약 |
| 추가 학생 좌석 | 3,900원/30일 | 가족 멤버십 만료일까지 일할 계산, 최소 결제 500원 |

- 보호자는 기본 2명, 추가 결제로 총 5명까지 학생을 연결할 수 있습니다.
- 세 번째 학생의 연결 코드를 발급할 때 좌석이 없으면 추가 결제 모달이 표시됩니다.
- 가족 멤버십 없이 이미 학생 2명이 연결된 보호자는 세 번째 좌석 요청 시 가족형 12,900원과 추가 좌석 3,900원을 한 주문으로 결제합니다.
- 가족 멤버십을 상속받는 학생에게 보호자 소유 멤버십 행을 복제하지 않습니다. 서버가 활성 `family_links`와 보호자 가족 멤버십을 확인해 effective entitlement를 계산합니다.
- 학생 단독 멤버십이 활성인 학생과 가족 Premium 보호자의 중복 가입·연결은 서버에서 차단합니다. 기존 학생 이용 기간은 즉시 제거하지 않고 만료일까지 보존합니다.
- 학생이 허용한 달성률·총 집중 시간·보상 상태·AI 요약만 보호자 가족 요약 입력으로 사용합니다. URL, 검색어, 화면 원본은 조회하지 않습니다.
- AI Edge Function은 요청할 때마다 effective entitlement를 재검증합니다. 미가입 사용자가 집중 페이지의 AI 버튼을 누르면 역할별 멤버십 안내 모달이 표시됩니다.

## 기술 스택

- Web/PWA: Next.js 16 App Router, React, TypeScript strict, Supabase SSR, Zod
- Chrome Extension: React, Vite, Manifest V3, Chrome Extension API
- Backend: Supabase Auth, PostgreSQL RLS/RPC, Edge Functions
- 결제: Toss Payments SDK 및 Core API 테스트 연동
- 공유 계약: npm workspace의 `@mirujima/contracts`
- 품질 검사: Vitest, ESLint, TypeScript

## 프로젝트 구조

```text
.
├─ apps/web/                  # Next.js Web/PWA Control Plane
│  ├─ app/                    # 공개·학생·보호자·결제 라우트
│  ├─ components/             # 공통 shell, brand, notification UI
│  ├─ features/               # auth, focus, family, wallet, membership
│  ├─ lib/                    # Supabase browser/server client
│  └─ public/                 # PWA service worker와 아이콘
├─ packages/contracts/        # Web↔Extension 공유 타입과 Zod schema
├─ src/                       # Chrome Extension
│  ├─ background/             # Service Worker, DNR, alarm, 복구, 알림
│  ├─ content/                # activity heartbeat와 화면 선택
│  ├─ features/               # focus, web bridge, tab organizer, cloud·AI service
│  ├─ popup/                  # 현재 세션 빠른 제어
│  ├─ sidepanel/              # 집중·탭·Web 이동 UI
│  └─ shared/                 # 타입, storage migration, Chrome wrapper, UI
├─ supabase/
│  ├─ migrations/             # 역할·가족·집중·멤버십·지갑 DB 변경
│  ├─ functions/              # 인증·결제·연결·동기화·AI Edge Functions
│  └─ tests/database/         # RLS, RPC와 원장 회귀 SQL
├─ docs/                      # 제품·기능·개인정보·설계 문서
├─ public/manifest.json       # production MV3 manifest
└─ vite.config.ts             # Extension multi-entry build와 origin 분리
```

## 빠른 시작

### 요구 환경

- Node.js `20.9.0` 이상 (`next@16.3.0`의 현재 engine 기준)
- npm
- Chrome `116` 이상
- 서버 기능을 확인할 경우 Supabase 프로젝트와 Google OAuth 설정

### 1. 의존성 설치

```bash
npm install
```

루트 `package-lock.json`과 npm workspaces를 사용하므로 Web과 공유 패키지 의존성도 함께 설치됩니다.

### 2. 환경 변수 준비

```bash
cp .env.example .env.local
cp apps/web/.env.example apps/web/.env.local
```

값은 각 환경의 Supabase·Toss·Extension 설정에 맞게 입력합니다. 비밀 키는 브라우저 환경 파일에 넣지 않습니다.

| 위치 | 변수 | 용도 |
|---|---|---|
| Extension | `VITE_SUPABASE_URL` | 공용 Supabase URL |
| Extension | `VITE_SUPABASE_PUBLISHABLE_KEY` | 브라우저용 publishable key |
| Extension | `VITE_PREMIUM_MONTHLY_PRICE_LABEL` | Extension에 표시할 멤버십 가격 문구 |
| Extension | `VITE_WEB_APP_ORIGIN` | Web external message의 정확한 허용 origin |
| Web | `NEXT_PUBLIC_SUPABASE_URL` | 공용 Supabase URL |
| Web | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 브라우저용 publishable key |
| Web | `NEXT_PUBLIC_TOSS_CLIENT_KEY` | Toss 테스트 client key |
| Web | `NEXT_PUBLIC_APP_ORIGIN` | OAuth·결제 callback 기준 origin |
| Web | `NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID` | Web이 메시지를 보낼 Extension ID |

`NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID`는 현재 `apps/web/.env.example`에 포함되지 않았지만, 사이트 차단 세션의 Extension 연결에 사용됩니다.

Supabase Edge Function secret에는 기능에 따라 `TOSS_SECRET_KEY`, `TOSS_PAYMENT_MODE=test`, `GROQ_API_KEY`가 필요합니다. `service_role` 계열 키와 Toss secret은 `NEXT_PUBLIC_*` 또는 `VITE_*` 변수에 저장하지 않습니다.

### 3. Web 실행

```bash
npm run dev --workspace @mirujima/web
```

기본 개발 주소는 `http://localhost:3000`입니다.

### 4. Extension 실행

UI만 빠르게 확인할 때:

```bash
npm run dev
```

Chrome에서 localhost Web과 실제 external messaging을 확인할 때는 개발 manifest가 생성되도록 빌드합니다.

```bash
npm run build:dev
```

1. Chrome에서 `chrome://extensions`를 엽니다.
2. **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 선택합니다.
4. 저장소의 `dist` 디렉터리를 지정합니다.

production build는 `https://mirujima.vercel.app`만 external origin으로 허용합니다.

```bash
npm run build
```

## 검증 명령

### Chrome Extension

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

### Web/PWA

```bash
npm run typecheck --workspace @mirujima/web
npm run lint --workspace @mirujima/web
npm test --workspace @mirujima/web
npm run build --workspace @mirujima/web
```

### 공유 계약

```bash
npm run typecheck --workspace @mirujima/contracts
npm test --workspace @mirujima/contracts
```

Supabase DB 회귀 테스트는 로컬 Supabase가 실행 중이고 migration이 적용된 환경에서 `supabase/tests/database/`를 대상으로 확인해야 합니다.

## 보안과 개인정보 원칙

- 보호자에게 전체 방문 URL, 검색어, 폼 입력값, 페이지 본문, 화면 캡처 원본을 공유하지 않습니다.
- Extension의 production external message origin은 정확한 Web 서비스 origin으로 제한합니다.
- 집중 차단은 서버 canonical 세션과 로그인 사용자 소유권을 다시 검증한 뒤 적용합니다.
- 포인트는 클라이언트 숫자를 직접 변경하지 않고 posted `wallet_transactions` 합산으로 계산합니다.
- 금융 mutation은 인증된 Edge Function과 서버 RPC를 거치며 멱등 키와 row lock으로 중복 반영을 막습니다.
- AI와 결제 provider secret은 Supabase Secret에만 저장합니다.

자세한 개인정보 기준은 [개인정보 처리 문서](docs/PRIVACY.md)를 확인하세요.

## 현재 제한

- Web의 홈·기록·보호자 통계 일부는 정적 또는 빈 상태 UI이며 실제 aggregate 연결이 남아 있습니다.
- 알림 센터와 학생 공유 설정 UI는 아직 Supabase `notifications`·profile 설정과 동기화되지 않습니다.
- 포인트 충전과 멤버십은 Toss 테스트 키만 허용하며 자동 갱신은 지원하지 않습니다.
- earned 포인트 현금화는 실제 송금이 아닌 샌드박스 원장 상태 전환입니다.
- `chrome://`, Chrome Web Store 등 Chrome 제한 페이지는 DNR·Content Script 기능을 적용할 수 없습니다.
- Supabase migration과 Edge Function이 배포되지 않은 환경에서는 로그인 이후 서버 기능이 동작하지 않습니다.

## 문서

- [AGENTS.md](AGENTS.md): v3 제품 요구사항, 보안 기준, 데이터 모델과 구현 원칙
- [Web · Chrome Extension 기능 책임표](docs/extension-web-capability-matrix.md): Web-primary와 Extension-only 경계
- [통합 기능 명세](docs/FEATURE_SPECIFICATION.md): 기존 기능과 상세 동작 명세
- [ERD](docs/ERD.md): 로컬 storage와 Supabase 데이터 구조
- [사용자 가이드](docs/USER_GUIDE.md): 기존 Extension 사용 흐름

상세 문서 중 일부는 v3 Web/PWA 전환 이전 화면을 포함합니다. 현재 구현 상태는 코드, migration, 이 README와 `AGENTS.md` v3를 우선해 판단합니다.
