import { expect, test } from "@playwright/test";
import { AUTHENTICATED_ROLE, AUTH_STORAGE_STATE } from "./helpers/auth-state";

test("거래 내역은 작은 행으로 표시되고 긴 주문 정보는 펼쳐서 확인한다", async ({ page }) => {
  test.skip(!AUTH_STORAGE_STATE, "인증 storage state가 필요합니다.");
  const id = "11111111-1111-4111-8111-111111111111";
  await page.route("**/rest/v1/rpc/list_wallet_transactions", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const item = { id, kind: "topup_confirmed", status: "posted", points: 10000, krwAmount: 10000,
      createdAt: "2026-10-02T10:00:00Z", scheduleId: null, sessionId: null, relatedTransactionId: null,
      orderId: "mirujima_topup_" + "a".repeat(150), fromBucket: "external", toBucket: "topup", provider: "toss",
      resolutionKind: null, resolutionTransactionId: null, reasonCode: null };
    await route.fulfill({ response, json: { ...data, items: [item], hasMore: false, nextCursor: null } });
  });
  await page.goto("/wallet/history");
  const panel = page.getByRole("region", { name: "전체 포인트 거래 내역" });
  const row = panel.locator(".wallet-history-item");
  await expect(row).toHaveCount(1);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(row.locator("details")).not.toHaveAttribute("open", "");
    await expect.poll(async () => (await row.boundingBox())!.height).toBeLessThan(200);
    await row.getByText("거래 정보", { exact: true }).click();
    await expect(row.getByText("주문 ID", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    await row.getByText("거래 정보", { exact: true }).click();
  }
  await row.getByRole("link", { name: "이 거래만 확인" }).click();
  await expect(page).toHaveURL(new RegExp("transaction=" + id));
  await expect(panel.locator("details.wallet-transaction-details")).toHaveAttribute("open", "");
  await panel.getByRole("link", { name: "전체 거래로 돌아가기" }).click();
  await expect(page).toHaveURL(/\/wallet\/history$/);
  await page.unrouteAll({ behavior: "wait" });
});

test("저장한 계획의 보조 버튼은 카드 전체 폭으로 늘어나지 않는다", async ({ page }) => {
  test.skip(!AUTH_STORAGE_STATE || AUTHENTICATED_ROLE !== "student", "학생 인증 storage state가 필요합니다.");
  await page.goto("/focus");
  const savedPlans = page.getByRole("region", { name: "저장한 계획" });
  await expect(savedPlans).toBeVisible();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ["새로고침", "새 계획 작성"]) {
      const bounds = await savedPlans.getByRole("button", { name, exact: true }).boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeLessThan(200);
      expect(bounds!.height).toBeLessThanOrEqual(40);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    expect(overflow).toBe(false);
  }
});

test("대시보드 본문은 모든 지원 너비에서 섹션 간격과 최대 폭을 유지한다", async ({ page }) => {
  test.skip(!AUTH_STORAGE_STATE, "인증 storage state가 필요합니다.");
  const path = AUTHENTICATED_ROLE === "guardian" ? "/guardian/history" : "/history";
  await page.goto(path);
  await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator(".app-main").evaluate((main) => {
      const sections = [...main.children].filter((node) => node.getBoundingClientRect().height > 0);
      return {
        width: main.getBoundingClientRect().width,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        gaps: sections.slice(1).map((section, index) => section.getBoundingClientRect().top - sections[index].getBoundingClientRect().bottom),
      };
    });
    expect(layout.overflow, `${width}px 가로 넘침`).toBe(false);
    expect(layout.width).toBeLessThanOrEqual(1200);
    for (const gap of layout.gaps) expect(gap, `${width}px 섹션 간격`).toBeGreaterThanOrEqual(19);
  }
});

test("충전 내역 dialog는 작은 화면과 확대 환경에서도 화면 안에 들어간다", async ({ page }) => {
  test.skip(!AUTH_STORAGE_STATE, "인증 storage state가 필요합니다.");
  await page.setViewportSize({ width: 320, height: 600 });
  await page.goto(AUTHENTICATED_ROLE === "guardian" ? "/guardian/my" : "/my");
  await page.getByRole("button", { name: AUTHENTICATED_ROLE === "guardian" ? "충전·환불 내역" : "충전 내역", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "포인트 충전 및 환불 내역" });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(15);
  expect(bounds!.y).toBeGreaterThanOrEqual(15);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(305);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(585);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("저장된 로그인 상태로 역할별 대시보드를 연다", async ({ page }) => {
  test.skip(!AUTH_STORAGE_STATE, "MIRUJIMA_E2E_STORAGE_STATE 또는 .auth/user.json이 없어 인증 검사를 건너뜁니다.");

  const expectedPath = AUTHENTICATED_ROLE === "guardian" ? "/guardian" : "/home";
  await page.goto(expectedPath);

  await expect(page).toHaveURL(new RegExp(`${expectedPath}/?$`));
  await expect(page.getByRole("navigation")).toBeVisible();
});

test("결제 dialog는 초기 focus와 Escape 닫기를 지원한다", async ({ page }) => {
  test.skip(!AUTH_STORAGE_STATE, "인증 storage state가 없어 dialog 접근성 검사를 건너뜁니다.");
  await page.goto("/wallet/charge");
  const dialog = page.getByRole("dialog", { name: "포인트 충전" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "결제 창 닫기" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(new RegExp(AUTHENTICATED_ROLE === "guardian" ? "/guardian/my/?$" : "/my/?$"));
});

test("학생 기록 차트에는 접근 가능한 표 요약이 함께 있다", async ({ page }) => {
  test.skip(!AUTH_STORAGE_STATE || AUTHENTICATED_ROLE !== "student", "학생 인증 storage state가 없어 기록 접근성 검사를 건너뜁니다.");
  await page.goto("/history");
  await expect(page.getByRole("img", { name: "날짜별 집중 시간 막대 차트" })).toBeVisible();
  await expect(page.getByRole("table", { name: "날짜별 집중 기록 표" })).toBeVisible();
});


test("결제 화면에는 내부 모드 문구가 없고 현금화 신청은 비활성화되어 있다", async ({ page }) => {
  test.skip(!AUTH_STORAGE_STATE, "인증 storage state가 필요합니다.");
  const paths = ["/wallet/charge", "/membership/checkout", "/wallet/history", ...(AUTHENTICATED_ROLE === "guardian" ? ["/wallet/refund"] : [])];
  for (const path of paths) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}/?$`));
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const copy = await page.locator("body").innerText();
    expect(copy).not.toMatch(/테스트|sandbox/);
  }
  if (AUTHENTICATED_ROLE === "student") {
    await page.goto("/wallet/cashout");
    await expect(page.getByText("포인트 현금화 서비스 준비 중", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "현금화 신청 준비 중" })).toBeDisabled();
  } else {
    await page.goto("/wallet/cashout");
    await expect(page).toHaveURL(/\/guardian(?:\/my)?\/?$/);
  }
});
