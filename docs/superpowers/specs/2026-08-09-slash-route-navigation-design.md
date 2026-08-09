# Slash Route Navigation 설계

## 목표

Mirujima 웹의 화면 이동 URL에서 hash 기반 경로를 제거하고 Next.js App Router의 `/` 경로를 사용한다.

## 현재 상태

앱 화면 이동은 이미 `/home`, `/focus`, `/history`, `/my`, `/guardian` 등 slash 경로를 사용한다. 남아 있는 hash 링크는 랜딩 페이지의 `#how`와 `#privacy` 두 개이며 각각 같은 페이지의 섹션으로 스크롤한다. Extension 내부 화면은 React 상태 전환이며 hash router를 사용하지 않는다.

## 변경 범위

- 랜딩 메뉴의 `#how`를 `/how`로 변경한다.
- 랜딩 메뉴의 `#privacy`를 `/privacy`로 변경한다.
- `/how` 페이지는 Mirujima의 계획, Extension 실행, Supabase 동기화 3단계 작동 방식을 설명한다.
- `/privacy` 페이지는 수집하지 않는 원본 정보와 학생이 동의한 보호자 공유 집계 정보, 결제·현금화 테스트 모드를 설명한다.
- 두 메뉴는 `<a>` 대신 Next.js `<Link>`를 사용한다.
- 기존 랜딩 섹션은 첫 화면 설명으로 유지하되 `id="how"`, `id="privacy"`에 의존하는 이동 계약은 제거한다.
- 외부 OAuth와 Toss callback query string은 hash navigation이 아니므로 변경하지 않는다.

## 사용자 경험

- 주소창에는 `/how` 또는 `/privacy`가 표시된다.
- 각 페이지는 직접 새로고침하고 공유할 수 있다.
- 브라우저 뒤로가기로 이전 화면에 복귀한다.
- 공통 Mirujima 브랜드와 랜딩으로 돌아가기 링크를 제공한다.
- mobile과 desktop에서 기존 디자인 토큰과 최대 본문 폭을 유지한다.

## 테스트

- 랜딩 navigation 계약 테스트에서 `#how`, `#privacy`가 없고 `/how`, `/privacy`가 존재하는지 검증한다.
- `/how`, `/privacy` production route 생성 여부를 Next.js build로 검증한다.
- Browser QA로 두 링크의 URL 이동, 의미 있는 DOM, 오류 overlay 및 console 상태를 확인한다.
