import { expect, test } from "@playwright/test";

const protectedRoutes = [
  "/home",
  "/focus",
  "/history",
  "/my",
  "/guardian",
  "/guardian/students",
  "/wallet/charge",
  "/wallet/history",
  "/membership/checkout",
] as const;

for (const path of protectedRoutes) {
  test(`${path}는 미인증 사용자를 로그인 화면으로 보낸다`, async ({ page }) => {
    await page.goto(path);

    await expect(page).toHaveURL(/\/login\/?\?next=/);
    expect(new URL(page.url()).searchParams.get("next")).toBe(path);
    await expect(page.getByRole("heading", { name: /미루지마 계정 로그인/ })).toBeVisible();
  });
}
