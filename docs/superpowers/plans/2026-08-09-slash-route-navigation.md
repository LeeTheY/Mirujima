# Slash Route Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two remaining landing-page hash links with shareable Next.js `/how` and `/privacy` routes.

**Architecture:** Keep the existing landing summaries but move navigation contracts to dedicated App Router pages. Use Next.js `Link` everywhere and verify that no screen-navigation hash remains.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Vitest, Browser QA.

## Global Constraints

- `#how` becomes `/how`.
- `#privacy` becomes `/privacy`.
- OAuth/Toss query parameters and CSS color hashes are not navigation and remain unchanged.
- Preserve unrelated dirty-worktree changes and existing Mirujima branding.

---

### Task 1: Define slash-link navigation contracts

**Files:**
- Create: `apps/web/features/navigation/public-navigation.ts`
- Create: `apps/web/features/navigation/public-navigation.test.ts`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Produces: `PUBLIC_NAVIGATION = [{ label: "작동 방식", href: "/how" }, { label: "개인정보", href: "/privacy" }]`.

- [ ] **Step 1: Write the failing contract test**

```ts
expect(PUBLIC_NAVIGATION).toEqual([
  { label: "작동 방식", href: "/how" },
  { label: "개인정보", href: "/privacy" },
]);
expect(PUBLIC_NAVIGATION.every((item) => item.href.startsWith("/") && !item.href.includes("#"))).toBe(true);
```

- [ ] **Step 2: Run RED**

Run: `npm test --workspace @mirujima/web -- features/navigation/public-navigation.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement constants and Link rendering**

Create the exact constant from Step 1. In `app/page.tsx`, map it to Next.js `Link`; remove `<a href="#how">` and `<a href="#privacy">`. Keep landing content but remove navigation dependence on section IDs.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm test --workspace @mirujima/web -- features/navigation/public-navigation.test.ts
npm run typecheck --workspace @mirujima/web
git add apps/web/features/navigation/public-navigation.ts apps/web/features/navigation/public-navigation.test.ts apps/web/app/page.tsx
git commit -m "fix: replace hash navigation links"
```

---

### Task 2: Add `/how` and `/privacy` pages

**Files:**
- Create: `apps/web/app/how/page.tsx`
- Create: `apps/web/app/privacy/page.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `Brand`, Next.js `Link`, existing CSS tokens.
- Produces: standalone public routes with landing back links.

- [ ] **Step 1: Implement `/how` content**

Render three numbered cards: web plan creation, Extension enforcement, Supabase canonical sync. Include a `/` return link and `/onboarding` CTA. Do not claim that web alone can enforce blocked sites.

- [ ] **Step 2: Implement `/privacy` content**

Render explicit “수집하지 않는 정보” and “동의 시 공유하는 집계 정보” lists from AGENTS.md. State that Toss and cashout are test-only with no actual charge/transfer. Include `/` and `/onboarding` links.

- [ ] **Step 3: Add scoped public-detail styles**

Add `.public-detail`, `.public-detail-header`, `.public-detail-grid`, and mobile breakpoint rules using existing `--bg`, `--surface`, `--navy`, `--border`, and `--primary` tokens. Do not alter dashboard layout classes.

- [ ] **Step 4: Build and commit**

```bash
npm test --workspace @mirujima/web
npm run typecheck --workspace @mirujima/web
npm run lint --workspace @mirujima/web
npm run build --workspace @mirujima/web
git add apps/web/app/how/page.tsx apps/web/app/privacy/page.tsx apps/web/app/globals.css
git commit -m "feat: add public information routes"
```

Expected build routes include `○ /how` and `○ /privacy`.

---

### Task 3: Browser verification

**Files:**
- No planned source changes; defects return to the owning task with a failing test.

- [ ] **Step 1: Verify landing navigation**

Click “작동 방식” and confirm URL `/how`, meaningful content, no overlay, and clean console. Return and click “개인정보”; confirm URL `/privacy` with the same checks.

- [ ] **Step 2: Verify no navigation hashes remain**

Run:

```bash
rg -n 'href=["'"']#|href:\s*["'"']#|HashRouter|createHashRouter|location\.hash|hashchange' apps/web src --glob '*.{ts,tsx,js,jsx}'
```

Expected: no screen-navigation matches. CSS colors and URL-fragment parsing tests are out of scope.

- [ ] **Step 3: Verify desktop and mobile rendering**

Check one desktop viewport and one mobile viewport for clipping, unreadable text, broken card stacking, console warnings, and correct back navigation.
