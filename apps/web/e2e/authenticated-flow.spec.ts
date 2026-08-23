import { expect, test } from "@playwright/test";
import { AUTHENTICATED_ROLE, AUTH_STORAGE_STATE } from "./helpers/auth-state";

test("저장된 로그인 상태로 역할별 대시보드를 연다", async ({ page }) => {
  test.skip(!AUTH_STORAGE_STATE, "MIRUJIMA_E2E_STORAGE_STATE 또는 .auth/user.json이 없어 인증 검사를 건너뜁니다.");

  const expectedPath = AUTHENTICATED_ROLE === "guardian" ? "/guardian" : "/home";
  await page.goto(expectedPath);

  await expect(page).toHaveURL(new RegExp(`${expectedPath}/?$`));
  await expect(page.getByRole("navigation")).toBeVisible();
});
