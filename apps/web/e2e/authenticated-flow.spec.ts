import { expect, test } from "@playwright/test";
import { AUTHENTICATED_ROLE, AUTH_STORAGE_STATE } from "./helpers/auth-state";

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
