# 미루지마 멤버십·학습 잔디·AI 화면 도구·클라우드 동기화 명세

> 이 문서는 기존 `AGENTS.md`를 수정하지 않고 멤버십 기능을 추가하기 위한 독립 실행 명세다.
> 구현 시 기존 `AGENTS.md`, `docs/EXISTING_FEATURE_PROTECTION.md`, 현재 코드와 테스트를 함께 읽고 기존 로컬 기능과 사용자 데이터를 보존한다.
>
> 문서 버전: `2.2`
> 작성 기준일: `2026-07-16`
> 구현 상태: Gate A·B·C·D 로컬 구현
> 전제: Supabase Free 프로젝트 생성 완료

---

## 0. 제품 목표

Stripe를 연결하기 전까지 다음 흐름을 완성한다.

```text
온보딩에서 Free 또는 Premium 월 요금제 선택
→ Premium 선택 시 Chrome 기본 Google 계정 확인
→ Supabase Google 로그인
→ 멤버십 정보 확인
→ 현재 버전에서는 결제 정보 입력 없이 Premium 활성화
→ 서버 entitlement 활성화
→ 여러 PC에서 같은 계정으로 Premium 복구
→ 학습 잔디와 30일 초과 기록 동기화
→ 화면 영역 OCR 및 문법·오탈자 교정 사용
→ 화면 영역의 핵심 내용 추출·요약·정리 사용
```

현재 구현할 Premium 기능은 다음 세 제품 기능과 멤버십 공통 혜택으로 제한한다.

1. 학습 잔디
2. 화면 영역 OCR + 문법·오탈자 교정 + 자연스러운 윤문
3. 화면 영역 핵심 내용 추출 + 요약 또는 학습 정리
4. 여러 PC 공유와 장기 데이터 보관

### 현재 보류

- Stripe Checkout, Webhook, Customer Portal
- 실제 카드 결제와 실제 구독 갱신
- 웹 하이라이트와 색상 형광펜
- 메모 폴더, 작업 과정 자동 캡처
- Scribe형 학습 가이드북과 오답 노트
- Stripe Live mode

Stripe는 향후 실제 결제 연동 시 현재의 Premium 활성화 지점에 연결한다. 지금은 사용하지 않는 Stripe package, secret, table, Edge Function을 미리 추가하지 않는다. 결제 연동 시 온보딩의 멤버십 확인 다음 단계에 Stripe Checkout을 삽입하고, 서명 검증 Webhook만 entitlement를 활성화하도록 교체한다.

---

## 1. 기존 기능 보호

- Free 사용자는 로그인 없이 기존 일정, 집중, 차단, 휴식, 알림, 리포트를 계속 사용한다.
- 멤버십 구현 때문에 기존 Free 기능을 제거하거나 약화하지 않는다.
- 로그인 또는 Supabase 장애로 기존 로컬 집중 기능이 중단되지 않게 한다.
- 기존 `chrome.storage.local` 데이터는 명시적 migration 없이 삭제하거나 덮어쓰지 않는다.
- Free 사용 중에는 Supabase와 Groq 요청을 보내지 않는다.
- Popup 380px, Side Panel 최소 폭, 전체 화면 반응형 기준을 유지한다.
- 기존 회귀 테스트를 삭제하거나 무력화하지 않는다.

---

## 2. Free와 Premium

```ts
export type MembershipPlan = "free" | "premium";
export type BillingIntegration = "deferred" | "stripe";
export type MembershipActivationSource =
  | "onboarding_deferred"
  | "stripe_subscription";

export type PremiumEntitlement =
  | "learning-grass"
  | "cloud-backup"
  | "cloud-sync"
  | "screen-ocr"
  | "grammar-correction"
  | "content-summary";
```

### 2.1 Free

- Google 로그인 불필요
- 기존 핵심 기능 사용 가능
- 기존 데이터는 `chrome.storage.local`에 저장
- 기존 활동 이벤트 보존 기간은 30일 유지
- Premium 메뉴에는 잠금 상태와 기능 설명 표시
- Supabase 및 Groq 외부 전송 없음

### 2.2 Premium

- 사용자에게 확정한 월 가격과 Premium 혜택 표시
- 현재 `BillingIntegration = "deferred"`에서는 결제 정보 입력 없이 활성화
- Google/Supabase 로그인 필수
- Premium 선택과 가입 동의 후 서버 entitlement 활성화
- 학습 잔디 사용
- 화면 영역 OCR과 문법 교정 사용
- 화면 영역의 핵심 내용 추출·요약·정리 사용
- 여러 PC 일정·설정·리포트·학습 기록 동기화
- Premium 구조화 데이터는 365일 보관
- 사용자가 직접 삭제하거나 계정을 삭제하면 보관 기간과 무관하게 삭제

### 2.3 월 가격 표시

- 온보딩 Premium 카드에 `월 <확정 가격>`을 표시한다.
- 가격 문자열은 한 곳의 product config에서 관리한다.
- Stripe 연결 전에는 가격이 안내용이며 실제 청구가 발생하지 않는다는 사실을 멤버십 확인 단계에 표시한다.
- Stripe 연결 시 같은 가격 표시를 Stripe Product/Price와 대조하고 불일치하면 Checkout을 열지 않는다.
- 사용자가 가격을 아직 확정하지 않았다면 구현 전에 `VITE_PREMIUM_MONTHLY_PRICE_LABEL` 값을 확정한다.

### 2.4 온보딩 멤버십 선택

기존 첫 실행 온보딩의 소개 다음 단계에 멤버십 선택을 추가한다.

```text
미루지마 소개
→ Free / Premium 선택
→ Premium이면 Chrome Google 계정 확인과 Supabase 로그인
→ 멤버십 확인
→ 현재는 결제 정보 입력 없이 Premium 활성화
→ 기존 주 UI·알림·차단·유휴 기준·첫 일정 온보딩 계속
→ 프로그램 사용
```

Free 카드:

- `Free`
- 기존 일정·집중·차단·리포트
- 현재 Chrome 프로필에 로컬 저장
- `Free로 시작`

Premium 카드:

- `Premium · 월 <확정 가격>`
- 학습 잔디
- 화면 OCR과 문법 교정
- 화면 핵심 요약과 학습 정리
- 여러 PC 공유
- 기록 365일 보관
- `Premium 선택`

Premium 멤버십 확인 화면의 필수 안내:

```text
Premium 월 <확정 가격>

같은 Google 계정으로 여러 PC에서 기록을 사용하고,
학습 잔디와 AI 문법 교정, 화면 핵심 요약 기능을 이용할 수 있습니다.

현재 버전에서는 결제 정보 입력 없이 Premium을 시작합니다.
결제 연동 후에는 이 단계에서 안전한 결제 화면으로 이동합니다.
```

버튼:

- `Premium 시작`
- `Free로 변경`

- 멤버십 선택은 건너뛸 수 있으며 건너뛰면 Free로 저장한다.
- Premium 선택 전에는 로그인 창을 열지 않는다.
- 온보딩 완료 후에도 Settings에서 Free/Premium 선택을 다시 볼 수 있다.
- 결제 연동 후에도 온보딩의 화면 순서는 유지하고 멤버십 확인과 활성화 사이에 Stripe Checkout만 추가한다.

### 2.5 데이터 보관 기준

| 데이터 | Free | Premium |
|---|---|---|
| 일정·설정 | 로컬 유지 | 계정 유지 중 cloud sync |
| 일일 리포트 | 로컬 | 365일 cloud 보관 |
| 학습 잔디 일일 집계 | 미제공 | 365일 cloud 보관 |
| 완료 집중 세션 요약 | 로컬 | 365일 cloud 보관 |
| heartbeat 원본 | 로컬 30일 | 로컬 30일, cloud 전송 금지 |
| OCR 원본 이미지 | 저장 안 함 | 기본 저장 안 함 |
| 문법 교정 입력 원문 | 저장 안 함 | 기본 저장 안 함 |
| 핵심 요약·학습 정리 입력과 결과 | 해당 없음 | 기본 저장 안 함 |
| 사용자가 저장한 교정 결과 | 해당 없음 | 사용자가 삭제할 때까지 또는 최대 365일 |

“30일 초과 보관”은 heartbeat나 전체 브라우징 기록을 장기 수집한다는 뜻이 아니다. 일정, 완료 세션 요약, 리포트, 학습 잔디처럼 사용자에게 장기 가치가 있는 구조화 데이터만 365일 cloud에 보관한다.

---

## 3. Chrome 로그인 계정과 Supabase 인증

### 3.1 계정 기준

멤버십은 현재 Chrome 프로필의 기본 Google 계정을 기준으로 가입하도록 안내한다.

1. 사용자 동작으로 `Premium 선택`
2. `chrome.identity.getProfileUserInfo({ accountStatus: "ANY" })`로 Chrome 기본 계정 확인
3. 감지한 이메일을 사용자에게 표시
4. 같은 이메일을 `login_hint`로 Supabase Google OAuth 시작
5. OAuth 완료 후 Supabase user ID를 실제 멤버십 소유자 ID로 사용
6. Chrome 기본 이메일과 Supabase 로그인 이메일이 다르면 가입을 완료하지 않고 계정 일치 안내

Chrome 계정의 이메일이나 GAIA ID만 DB로 보내 멤버십을 인증하지 않는다. Chrome 정보는 계정 선택과 일치 확인용이며, 실제 인증·RLS·동기화 소유권은 Supabase Auth의 `auth.users.id`를 기준으로 한다.

Chrome에 로그인되어 있지 않으면 다음을 표시한다.

```text
Premium은 여러 PC에서 같은 학습 기록을 사용하기 위해
Chrome에 로그인된 Google 계정이 필요합니다.

[Chrome 로그인 후 다시 확인]
[Free로 계속]
```

### 3.2 OAuth 흐름

- Manifest에 `identity`, `identity.email` 권한 추가
- 사용자가 Premium을 선택한 경우에만 interactive OAuth 시작
- 설치 직후 자동 로그인 창 금지
- Supabase Google OAuth + PKCE 사용
- `chrome.identity.launchWebAuthFlow()` 사용
- callback은 `chrome.identity.getRedirectURL("supabase-auth")` 사용
- 반환된 일회용 code를 `exchangeCodeForSession(code)`로 교환
- Google provider token과 refresh token은 별도 저장하지 않음
- Supabase access/refresh session만 trusted extension storage에 저장
- Content Script에서 Supabase client 또는 auth session에 직접 접근 금지

### 3.3 Redirect 구분

Google Cloud Console OAuth redirect URI:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

Supabase Auth Redirect URL allowlist:

```text
https://<extension-id>.chromiumapp.org/supabase-auth
```

개발용 Extension ID와 배포용 Extension ID는 각각 등록한다. 와일드카드 redirect를 사용하지 않는다.

### 3.4 세션 저장

- `chrome.storage.local` custom storage adapter 사용
- `chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })` 적용
- Service Worker 재시작 후 session refresh와 membership 복구
- PKCE verifier는 인증 완료·취소·만료 후 제거
- 로그아웃 시 Supabase session과 계정 전용 cloud cache를 잠그거나 제거
- 로그인 전에 존재했던 Free 로컬 데이터는 로그아웃으로 삭제하지 않음

---

## 4. Premium 활성화

현재는 Stripe를 연결하지 않고, 온보딩에서 선택한 Premium을 서버가 활성화한다. 결제 연동 후에도 계정 확인과 entitlement 구조는 유지하고 활성화 주체만 Stripe Webhook으로 교체한다.

```text
Premium 선택
→ Chrome 기본 계정 확인
→ Supabase Google 로그인
→ 월 가격·혜택과 결제 연동 전 안내 확인
→ activate-membership Edge Function
→ membership + entitlement server transaction
→ Premium 활성화
```

필수 안내:

```text
현재 버전에서는 결제 정보 입력 없이 Premium을 시작합니다.
결제 연동 후에는 이 단계에서 안전한 결제 화면으로 이동합니다.
같은 Google 계정으로 여러 PC에서 학습 기록을 사용할 수 있고,
Premium 기록은 최대 365일 보관됩니다.
```

### 4.1 서버 권한 원칙

- 로컬 `isPremium = true`만으로 기능을 열지 않는다.
- `activate-membership`은 로그인한 Supabase 사용자만 호출한다.
- 서버의 `BILLING_INTEGRATION=deferred` 설정을 확인한다.
- 서버가 membership과 entitlement를 transaction으로 갱신한다.
- 같은 사용자의 반복 요청은 idempotent해야 한다.
- Premium API는 매 요청마다 필요한 entitlement를 확인한다.
- 향후 Stripe 도입 시 `BILLING_INTEGRATION=stripe`로 전환하고, 이 활성화 Function을 차단한 뒤 Stripe Webhook이 동일 entitlement를 갱신한다.

---

## 5. Premium 기능 1: 학습 잔디

### 5.1 위치

- 전체 잔디: Reports 페이지 상단
- 오늘 요약: Today에 `연속 학습 N일` 작은 카드
- Popup에는 잔디 전체를 넣지 않고 오늘 기록 또는 연속 일수만 표시 가능

별도의 하단 메뉴를 추가하지 않는다.

### 5.2 표시

- 기본 한 달 보기
- 월 이전·다음 이동
- `오늘로 이동`
- 0~4단계 명도
- 색상만으로 상태를 구분하지 않음
- 날짜 cell의 tooltip 또는 상세 dialog 제공

상세 예시:

```text
2026년 7월 16일
집중 85분
완료 일정 2개
목표 달성률 75%
```

### 5.3 집계 기준

단순 앱 실행이나 클릭 횟수로 잔디를 만들지 않는다.

```ts
learningScore = actualFocusMinutes + completedScheduleCount * 10;
```

초기 강도 기준:

- 0: 기록 없음
- 1: 1~29점
- 2: 30~59점
- 3: 60~119점
- 4: 120점 이상

점수 계산은 순수 함수로 분리하고 테스트한다. 나중에 노트·가이드북 기능을 추가해도 기존 점수 의미를 조용히 변경하지 않는다.

### 5.4 데이터

```text
cloud_learning_days
- user_id uuid
- date_key date
- actual_focus_minutes integer
- completed_schedule_count integer
- achievement_rate integer
- learning_score integer
- intensity smallint
- version bigint
- updated_at timestamptz
- unique(user_id, date_key)
```

- Free에서는 Premium 잔디 데이터를 생성하거나 cloud에 전송하지 않는다.
- Premium은 날짜별 집계를 idempotent하게 재생성할 수 있어야 한다.
- 사용자 로컬 timezone 기준 `YYYY-MM-DD`를 사용한다.
- 최소 최근 12개월을 조회할 수 있게 하되 이번 UI 기본값은 한 달이다.

---

## 6. Premium 기능 2: 화면 OCR과 문법 교정

### 6.1 사용자 흐름

```text
화면 영역으로 글 가져오기
→ 현재 탭 위에 선택 overlay
→ 사용자가 사각형 영역 drag
→ visible tab capture
→ 선택 영역 crop
→ 전송 이미지 preview와 동의
→ Qwen OCR
→ OCR 원문 검토
→ GPT-OSS 문법·오탈자 교정 및 윤문
→ 원문/교정문 diff
→ 복사 또는 지원 입력창에 적용
```

### 6.2 Groq 모델

```text
OCR: qwen/qwen3.6-27b
문법 교정·윤문: openai/gpt-oss-120b
```

- 모델 ID는 Edge Function server constant로 관리
- 클라이언트가 임의 모델 ID를 보내지 않음
- OCR은 이미지에서 텍스트만 추출하고 내용을 임의로 교정하지 않음
- GPT-OSS는 OCR 원문과 사용자 선택 스타일을 받아 구조화된 교정 결과 생성
- JSON Schema로 원문, 교정문, 윤문문, 변경 목록 반환

### 6.3 보안과 개인정보

- Groq API key는 Supabase Edge Function Secret에만 저장
- 확장 프로그램 bundle, `.env.local`, `chrome.storage`에 Groq key 저장 금지
- 서버가 `screen-ocr`, `grammar-correction` entitlement 확인
- 사용자가 실행한 경우에만 화면과 텍스트 전송
- 전송 전 preview와 취소 제공
- 비밀번호·결제·민감 입력 화면 경고
- OCR 원본 이미지는 처리 후 저장하지 않음
- 교정 입력 원문과 모델 출력은 기본 cloud 저장하지 않음
- 사용자가 `결과 저장`을 선택한 결과만 장기 데이터로 저장
- hostname, query, 페이지 전체 본문을 AI 요청에 자동 첨부하지 않음

### 6.4 MVP 적용 범위

- 현재 보이는 viewport 영역 capture
- Side Panel에서 OCR 원문 검토
- 문법·오탈자 교정
- 자연스러운 윤문
- 변경점 비교
- 클립보드 복사
- 일반 `textarea`, `input`, `contenteditable`에 명시적 적용

다음은 보장하지 않는다.

- 전체 페이지 자동 scroll stitching
- Google Docs, Notion, CodeMirror 등 모든 편집기 직접 치환
- `chrome://`, Chrome Web Store 등 제한 페이지
- Chrome 밖 데스크톱 앱 화면

---

## 7. Premium 기능 3: 화면 핵심 요약과 학습 정리

Gate C에서 구현한 영역 선택, capture, crop, preview, Qwen OCR 기반을 재사용한다. 사용자는 영역 선택 후 `문법 교정`, `핵심 요약`, `학습 정리` 중 목적을 선택한다.

### 7.1 사용자 흐름

```text
화면 영역으로 내용 가져오기
→ 현재 탭 위에 선택 overlay
→ 사용자가 사각형 영역 drag
→ 선택 영역 preview와 외부 전송 동의
→ 결과 방식 선택: 핵심 요약 / 학습 정리
→ Qwen OCR과 문단·표·목록 구조 추출
→ GPT-OSS가 중요 내용 판단과 구조화
→ OCR 원문, 핵심 내용, 요약 또는 정리 결과 확인
→ 원문 대조 후 복사
```

### 7.2 결과 방식

`핵심 요약`:

- 한 문장 주제
- 중요 내용 3~5개
- 짧은 전체 요약
- 각 중요 내용이 참고한 OCR block ID
- 인식이 불확실하거나 문맥이 부족한 항목

`학습 정리`:

- 제목
- 핵심 개념
- 개념별 설명
- 주요 용어와 정의
- 기억할 내용
- 추가로 확인할 내용
- 각 항목의 OCR block ID

AI가 중요하다고 판단했다는 이유만으로 원문에 없는 사실을 추가하지 않는다. 표, 수식, 잘린 문장처럼 확신하기 어려운 내용은 추측하지 않고 `확인 필요`로 반환한다.

### 7.3 정확성 안내

실행 전 preview에 다음 취지의 짧은 안내를 표시한다.

```text
AI가 화면의 글자나 문맥을 잘못 인식할 수 있습니다.
민감한 정보가 포함되지 않았는지 확인해 주세요.
```

모든 결과 화면에는 다음 안내를 항상 표시한다.

```text
AI가 생성한 내용은 부정확하거나 중요한 맥락을 누락할 수 있습니다.
학습이나 업무에 사용하기 전에 반드시 원문과 대조해 확인해 주세요.
```

- 안내는 색상만으로 구분하지 않고 정보 아이콘과 텍스트를 함께 사용한다.
- 사용자가 닫더라도 다음 새 결과에는 다시 표시한다.
- 의료·법률·재무 등 중요한 판단의 근거로 단독 사용하지 않도록 안내한다.
- OCR 원문을 접어서 볼 수 있게 제공하고 결과 항목에서 관련 OCR block으로 이동할 수 있게 한다.

### 7.4 모델과 응답 구조

```text
OCR·화면 구조: qwen/qwen3.6-27b
중요도 판단·요약·정리: openai/gpt-oss-120b
```

Edge Function은 `task: "content-summary" | "study-organize"`를 받아 Gate C의 `ai-writing` orchestration을 재사용한다. 응답은 JSON Schema로 검증하며 최소한 다음 값을 포함한다.

```ts
interface ContentSummaryResult {
  title: string;
  mode: "content-summary" | "study-organize";
  keyPoints: Array<{
    text: string;
    sourceBlockIds: string[];
  }>;
  summary: string;
  sections: Array<{
    heading: string;
    content: string;
    sourceBlockIds: string[];
  }>;
  uncertainItems: string[];
}
```

### 7.5 보안과 저장

- 서버가 `screen-ocr`와 `content-summary` entitlement를 모두 확인한다.
- 선택 영역 밖의 페이지 본문, hostname, URL, query를 자동 첨부하지 않는다.
- 이미지, OCR 원문, 요약 결과를 기본 저장하지 않는다.
- MVP에서는 결과 확인과 복사만 제공한다.
- 향후 `결과 저장`을 추가할 경우 별도 동의, 삭제, 365일 보관 정책과 cloud schema를 먼저 추가한다.
- Gate A migration을 이미 배포했다면 기존 migration을 수정하지 않고 새 migration으로 `content-summary` constraint와 entitlement를 추가한다.
- 기존 Premium 사용자와 새 Premium 사용자 모두 `content-summary` entitlement를 받도록 backfill과 활성화 RPC를 함께 갱신한다.

---

## 8. 여러 PC 공유와 cloud 보관

### 8.1 동기화 대상

- 일정
- 사용자 설정
- 완료 집중 세션 요약
- 일일 리포트
- 학습 잔디 일일 집계
- 사용자가 저장한 교정 결과
- 삭제 tombstone과 sync metadata

### 8.2 항상 로컬

- Chrome tab/window/group ID
- DNR session rule
- alarm
- Content Script heartbeat 원본
- 임시 허용
- 아직 전송하지 못한 pending mutation queue
- OCR 처리 전·처리 중 임시 이미지

### 8.3 동기화 원칙

- Premium online: Supabase가 공유 데이터의 canonical source
- Premium offline: 먼저 로컬에 기록하고 pending queue에 추가
- stable ID, server `updated_at`, version, device ID 사용
- mutation ID로 재시도 idempotency 보장
- expected version이 다르면 자동 덮어쓰기 대신 conflict 표시
- client clock의 `updatedAt`만으로 최신 여부를 판단하지 않음
- cloud 실패 때문에 로컬 집중 기능을 막지 않음

### 8.4 다른 PC

```text
다른 PC의 Chrome에서 같은 Google 계정 로그인
→ 미루지마 Premium 로그인
→ Supabase user ID와 entitlement 복구
→ cloud snapshot download
→ 로컬 기존 데이터와 병합 preview
→ 사용자 확인 후 동기화
```

다른 Google 계정으로 로그인하면 별도 사용자로 처리한다. 이메일 문자열이 같아 보인다는 이유로 계정을 병합하지 않는다.

---

## 9. Supabase 데이터 모델

### 9.1 profiles

```text
id uuid primary key references auth.users(id)
display_name text
avatar_url text
created_at timestamptz
updated_at timestamptz
```

### 9.2 memberships

```text
user_id uuid primary key references auth.users(id)
plan text check (plan in ('free', 'premium'))
billing_integration text check (billing_integration in ('deferred', 'stripe'))
activation_source text check (activation_source in ('onboarding_deferred', 'stripe_subscription'))
status text check (status in ('active', 'inactive'))
activated_at timestamptz
updated_at timestamptz
```

### 9.3 membership_entitlements

```text
user_id uuid references auth.users(id)
feature_key text
enabled boolean
source text check (source in ('onboarding_deferred', 'stripe_subscription'))
valid_until timestamptz null
updated_at timestamptz
primary key(user_id, feature_key)
```

### 9.4 devices

```text
id uuid primary key
user_id uuid references auth.users(id)
client_generated_device_id text
device_name text
extension_version text
last_seen_at timestamptz
created_at timestamptz
updated_at timestamptz
unique(user_id, client_generated_device_id)
```

### 9.5 cloud tables

- `cloud_schedules`
- `cloud_settings`
- `cloud_focus_sessions`
- `cloud_reports`
- `cloud_learning_days`
- `cloud_saved_corrections`
- `sync_mutations`

모든 사용자 cloud table은 stable ID, user ID, version, device ID, deleted_at, created_at, updated_at을 필요에 맞게 가진다.

---

## 10. RLS와 서버 보안

- public schema의 모든 사용자 table에 RLS 활성화
- `(select auth.uid()) = user_id` 소유권 정책
- user_id policy column index 생성
- 클라이언트는 memberships와 entitlements를 직접 수정하지 못함
- 사용자는 자신의 membership/entitlement만 조회 가능
- Premium 활성화와 AI 호출은 Edge Function에서 처리
- Supabase secret/service role key는 확장 프로그램에 포함 금지
- DB privileged RPC는 public/anon execute revoke
- `security definer` 사용 시 `search_path = ''`와 schema-qualified relation 사용
- 다른 사용자 데이터 접근 RLS 테스트 필수

서버 Premium 판정:

```text
memberships.plan = premium
AND memberships.status = active
AND membership_entitlements.feature_key = <요청 기능>
AND membership_entitlements.enabled = true
AND (valid_until IS NULL OR valid_until > server_now)
```

---

## 11. Supabase Edge Functions

### 11.1 activate-membership

- Supabase 로그인 사용자만 호출
- `BILLING_INTEGRATION=deferred` 확인
- Gate C까지는 5개 entitlement를 활성화하고, Gate D migration 적용 후 `content-summary`를 포함한 6개 entitlement를 DB transaction으로 활성화
- 반복 호출 idempotent
- `activation_source=onboarding_deferred` 기록
- 결제 정보 입력 전 단계라는 응답 포함
- `BILLING_INTEGRATION=stripe` 환경에서는 호출 거부

### 11.2 get-membership-entitlements

- 로그인 사용자의 plan, status, entitlement 반환
- Chrome 재시작, 다른 PC 로그인, Premium API 진입 때 사용
- 내부 DB row와 secret은 불필요하게 노출하지 않음

### 11.3 ai-writing

- 로그인 사용자만 호출
- 요청 종류별 entitlement 확인
- 이미지 크기, 이미지 수, 텍스트 길이 제한
- Qwen OCR과 GPT-OSS 교정·요약·학습 정리 orchestration
- `grammar-correction`, `content-summary`, `study-organize` task별 JSON Schema와 rate limit 분리
- timeout, 429, 5xx retry/backoff
- 원문과 이미지 log 금지
- 모델 사용량 숫자만 기록 가능

### 11.4 delete-cloud-data

- 로그인 재확인
- 이중 확인
- cloud 사용자 데이터와 저장 교정 결과 삭제
- 계정 삭제와 Premium 비활성화를 별도 동작으로 유지

---

## 12. 환경 변수와 Secret

### 12.1 확장 프로그램 `.env.local`

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_BILLING_INTEGRATION=deferred
VITE_PREMIUM_MONTHLY_PRICE_LABEL=월 <확정 가격>
```

브라우저에는 Supabase publishable key만 포함할 수 있다.

### 12.2 Supabase Edge Function Secrets

```text
BILLING_INTEGRATION=deferred
GROQ_API_KEY=gsk_...
GROQ_OCR_MODEL=qwen/qwen3.6-27b
GROQ_WRITING_MODEL=openai/gpt-oss-120b
```

- Groq key는 사용자가 Supabase Dashboard에 직접 등록
- key 값을 채팅, Git, log, screenshot에 노출 금지
- Stripe 관련 환경 변수는 실제 결제 연동을 시작할 때 추가

---

## 13. UI

### 13.1 Settings 멤버십 카드

Free:

- 현재 `Free`
- 기존 기능은 로컬에서 계속 사용 가능
- Premium 혜택: 잔디, AI 교정·핵심 요약, 여러 PC, 365일 보관
- `Premium · 월 <확정 가격>` 표시
- `Premium 선택`

Premium:

- Chrome/Supabase 계정 기본 정보
- `Premium`
- `결제 연동 전` badge
- 마지막 동기화 시각
- 연결된 기기 수
- `지금 동기화`
- `백업에서 복원`
- `로그아웃`
- `클라우드 데이터 삭제`

### 13.2 Premium 잠금

- 잠금 아이콘만 표시하지 않음
- 왜 로그인이 필요한지 설명
- 현재는 결제 정보 입력 없이 Premium이 활성화되며, 결제 연동 후 이 단계에 결제 화면이 추가된다고 설명
- Free 핵심 기능이 잠긴다는 오해를 주지 않음
- 긴 로그인·동기화·충돌 처리는 전체 확장 페이지에서 제공

### 13.3 Navigation

- 기존 하단 6개 메뉴 유지
- 학습 잔디는 Reports에 배치
- AI 화면 도구는 하나의 화면 선택 action으로 시작하고 Side Panel에서 `문법 교정`, `핵심 요약`, `학습 정리`를 선택
- 보류된 하이라이트/노트 메뉴를 추가하지 않음

---

## 14. 구현 전 사용자가 준비할 것

### 14.1 Supabase 기본 값

먼저 월 가격 표시를 확정한 뒤 프로젝트 `.env.local`에 직접 입력:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_BILLING_INTEGRATION=deferred
VITE_PREMIUM_MONTHLY_PRICE_LABEL=월 <확정 가격>
```

### 14.2 Chrome 개발용 Extension ID

`chrome://extensions`에서 현재 unpacked extension ID 확인. 개발·배포 callback 등록에 사용한다.

### 14.3 Google OAuth

1. Google Cloud 프로젝트 준비
2. OAuth Client 생성
3. Google callback에 Supabase `/auth/v1/callback` 등록
4. Supabase Authentication Provider에서 Google 활성화
5. Google Client ID/Secret을 Supabase Dashboard에 직접 입력
6. Supabase Redirect URL에 `chromiumapp.org/supabase-auth` 등록

### 14.4 Groq

AI 기능 구현 직전 준비한다.

1. Groq API key 생성
2. Supabase Edge Function Secrets에 `GROQ_API_KEY`로 직접 등록
3. key 값은 Codex에게 전달하지 않고 `등록 완료`만 알림

### 14.5 이번에 준비하지 않는 것

- Stripe 계정
- Stripe Product/Price
- Stripe API key
- Stripe Webhook
- 실제 결제 정보

---

## 15. 실행 순서와 Gate

이 Markdown 파일 자체를 실행하는 것이 아니라, 아래 Gate별 구현 명세로 사용한다.

### Gate A. 계정과 멤버십

시작 조건:

- `VITE_PREMIUM_MONTHLY_PRICE_LABEL` 확정
- Supabase URL/publishable key 준비
- 개발용 Extension ID 확인
- Google Provider 및 redirect 설정 완료

구현:

1. Manifest identity 권한
2. Chrome 기본 계정 확인 UI
3. Supabase Google PKCE 로그인
4. trusted session storage
5. profiles, memberships, entitlements, devices migration
6. RLS와 activation transaction RPC
7. activate-membership/get-entitlements Edge Functions
8. Settings 멤버십 카드와 feature gate

Gate A 완료 후 Google 로그인, 다른 Chrome 프로필 로그인, entitlement 복구를 검증한다.

구현 메모(2026-07-16): Gate A의 extension 코드, DB migration, RLS, service-role 전용 activation RPC, `activate-membership`/`get-membership-entitlements` Edge Function과 Settings/온보딩 UI가 저장소에 추가되었다. Supabase migration·Function 배포, Google OAuth 실계정 로그인, 다른 Chrome 프로필 복구 검증은 외부 프로젝트에서 별도로 수행해야 한다.

### Gate B. 학습 잔디와 장기 cloud 기록

시작 조건:

- Gate A 통과

구현:

1. cloud schedule/settings/session/report schema
2. cloud_learning_days와 365일 보관 정책
3. Reports 월간 잔디
4. Today 연속 학습 card
5. 수동 초기 backup/restore
6. pending mutation과 여러 PC sync
7. conflict/tombstone/offline 복구

구현 메모(2026-07-16): Gate B의 cloud schedule/settings/completed-session/report/learning-day schema, RLS, 365일 정리 함수, idempotent version mutation RPC와 `cloud-sync` Edge Function을 추가했다. 확장 프로그램에는 local-first pending queue, 수동 최초 백업/복원 preview·확인, 15분 동기화 alarm, conflict 선택, schedule tombstone, Reports 월간 잔디와 Today 연속 학습 card를 연결했다. Free에서는 학습 집계 생성과 cloud 요청을 하지 않으며 heartbeat와 탭 snapshot은 전송하지 않는다. Supabase migration·Function 배포와 실제 두 Chrome 프로필 간 동기화 검증은 외부 프로젝트에서 수행해야 한다.

### Gate C. 화면 OCR과 문법 교정

시작 조건:

- Gate A 통과
- Supabase Secrets에 Groq key 등록 완료

구현:

1. 화면 영역 선택 overlay
2. visible tab capture와 crop
3. 전송 preview
4. ai-writing Edge Function
5. Qwen OCR
6. GPT-OSS 교정·윤문
7. diff, 복사, 지원 입력창 적용
8. rate limit, timeout, privacy 테스트

구현 메모(2026-07-16): Gate C의 현재 viewport 선택 overlay, screenshot 해상도 기반 crop, 민감 정보 경고와 전송 preview·동의, OCR 원문 검토, 세 가지 교정 스타일, 원문 diff, 복사와 일반 입력창 적용을 추가했다. `ai-writing` Edge Function은 `screen-ocr`/`grammar-correction` entitlement와 사용자별 분당 한도를 확인하고, Qwen OCR과 GPT-OSS strict JSON Schema 교정을 서버 secret으로 호출한다. 이미지·원문·결과는 기본 저장하거나 log하지 않는다. Supabase migration·Function 배포와 실제 Groq 호출·제한 페이지·입력창 수동 검증은 외부 프로젝트에서 수행해야 한다.

Gate B와 C는 Gate A 이후 순서를 바꿀 수 있지만 동시에 대규모 구현하지 않는다.

### Gate D. 화면 핵심 요약과 학습 정리

시작 조건:

- Gate C의 영역 선택, capture, crop, preview, Qwen OCR 통과
- Supabase Secrets에 Groq key 등록 완료

구현:

1. 영역 선택 후 결과 방식 선택 UI
2. OCR block ID와 문단·표·목록 구조 보존
3. `content-summary`, `study-organize` 요청과 JSON Schema
4. 중요 내용 3~5개와 원문 근거 block 연결
5. 요약 또는 학습 정리 결과 화면
6. 불확실한 내용과 `확인 필요` 표시
7. 실행 전·결과 화면 정확성 안내
8. `content-summary` entitlement 추가 migration과 기존 Premium 사용자 backfill
9. `activate-membership`, entitlement 조회, `ai-writing` 권한 검사 갱신
10. 기본 저장 없이 원문 대조와 복사 제공

구현 메모(2026-07-16): Gate D는 Gate C의 overlay·capture·crop·preview를 재사용하고, Qwen OCR 결과를 heading/paragraph/list/table/formula block과 stable `b1` ID로 구조화한다. Side Panel에서 문법 교정·핵심 요약·학습 정리를 선택할 수 있고, GPT-OSS 결과의 3~5개 핵심 내용과 각 section은 유효한 OCR block 근거를 반드시 가진다. 근거 이동, 접이식 OCR 원문, 불확실 항목, 실행 전·결과 정확성 안내, 결과 복사를 추가했다. 새 migration은 `content-summary` entitlement constraint·기존 Premium backfill·activation RPC와 task별 rate limit을 추가한다. 이미지·원문·결과는 기본 저장하지 않는다. Supabase migration·Function 재배포와 실제 Groq·Chrome 수동 검증은 외부 프로젝트에서 수행해야 한다.

Gate D는 Gate C의 OCR 기반을 재사용하며 Gate C 완료 전에 별도 capture 구현을 중복 작성하지 않는다.

---

## 16. 테스트

### 16.1 인증·멤버십

- Chrome 미로그인
- Chrome 기본 계정 감지
- Supabase 로그인 계정 일치/불일치
- 로그인 취소와 callback 오류
- Service Worker 재시작 후 session 복구
- 로컬 boolean 조작으로 Premium 획득 불가
- 다른 사용자 entitlement 변경 불가
- 결제 연동 전 Premium 활성화 idempotency

### 16.2 잔디·동기화

- 학습 점수와 강도 경계
- 로컬 timezone 날짜 경계
- 동일 날짜 idempotent 집계
- PC A 변경 → PC B 반영
- offline queue 재시도
- version conflict
- tombstone
- 30일 이후 Premium 기록 조회
- Free 사용 시 cloud 요청 없음

### 16.3 AI 문법 교정

- devicePixelRatio를 고려한 crop 좌표
- OCR 실패/빈 결과
- 교정 JSON Schema validation
- Groq 429/timeout/5xx
- entitlement 없는 AI 요청 차단
- 이미지와 원문 log 금지
- restricted page 안내
- 일반 입력창 적용과 취소

### 16.4 AI 핵심 요약과 학습 정리

- `content-summary` entitlement가 없는 요청 차단
- 선택 영역 밖 페이지 데이터가 요청에 포함되지 않음
- 핵심 내용 3~5개 제한
- 모든 key point와 section의 `sourceBlockIds` 유효성
- OCR에 없는 사실 추가 방지
- 잘린 문장, 표, 수식은 `uncertainItems` 또는 `확인 필요`로 반환
- 실행 전과 결과 화면에 정확성 안내 표시
- 새 결과마다 닫았던 정확성 안내 재표시
- 이미지, OCR 원문, 결과 기본 미저장
- Gate D migration의 기존 Premium 사용자 backfill
- 새 Premium 활성화 시 6개 entitlement 생성

### 16.5 기존 회귀

```text
npm run typecheck
npm run lint
npm test
npm run build
```

Chrome 수동 점검에는 Popup 380px, 최소 Side Panel, 차단, 알림, 집중 종료, Service Worker 복구를 포함한다.

---

## 17. 완료 기준

- Free는 로그인 없이 기존 기능을 사용할 수 있다.
- 현재 구현에는 Stripe 호출과 결제가 없고, Premium 활성화 지점은 추후 Stripe Checkout과 Webhook으로 교체할 수 있다.
- Chrome 기본 Google 계정을 가입 기준으로 안내한다.
- Supabase Auth user ID가 실제 소유권 기준이다.
- 같은 Google 계정으로 다른 PC에서 Premium이 복구된다.
- Premium은 학습 잔디를 사용할 수 있다.
- Premium 구조화 기록을 30일보다 긴 365일 동안 조회할 수 있다.
- Premium은 화면 OCR과 문법·오탈자 교정·윤문을 사용할 수 있다.
- Premium은 선택 영역에서 중요 내용을 추출해 핵심 요약 또는 학습 정리 결과를 확인할 수 있다.
- AI 요약 결과에는 부정확성과 문맥 누락 가능성을 알리는 원문 대조 안내가 항상 표시된다.
- Groq key가 확장 bundle에 포함되지 않는다.
- 하이라이트·메모·가이드북 기능은 구현되지 않는다.
- RLS로 다른 사용자 데이터 접근이 차단된다.
- cloud 또는 AI 오류가 기존 로컬 집중 기능을 막지 않는다.
- 기존 자동 테스트와 최종 검증이 통과한다.

---

## 18. 구현 완료 보고 형식

1. Free와 Premium 사용자 동작
2. Chrome 계정 확인과 Supabase 로그인 흐름
3. membership/entitlement/RLS 목록
4. 학습 잔디 계산과 UI 위치
5. 여러 PC 공유와 365일 보관 범위
6. Qwen OCR과 GPT-OSS 교정 흐름
7. 화면 핵심 추출·요약·학습 정리와 원문 근거 연결
8. 정확성 안내와 `확인 필요` 처리
9. 외부 전송 데이터와 저장하지 않는 데이터
10. 추가 권한과 환경 변수 이름만 보고
11. typecheck, lint, test, build 결과
12. Chrome에서 직접 확인할 제약

“Premium 버튼이 보인다”만으로 완료 처리하지 않는다. 다른 Chrome 프로필에서 같은 계정 복구, 다른 사용자 RLS 차단, 365일 cloud 정책, AI entitlement 차단까지 검증해야 한다.
