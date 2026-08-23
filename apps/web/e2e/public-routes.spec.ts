import { expect, test } from "@playwright/test";

const publicRoutes = [
  { path: "/", heading: "미루지 않을" },
  { path: "/login", heading: "목표를 집중으로" },
  { path: "/how", heading: "계획을 실제 집중 환경으로 연결합니다." },
  { path: "/privacy", heading: "집중을 돕되, 감시하지 않습니다." },
  { path: "/offline", heading: "인터넷 연결을 확인해 주세요." },
] as const;

for (const route of publicRoutes) {
  test(`${route.path} 공개 화면을 로그인 없이 연다`, async ({ page }) => {
    const response = await page.goto(route.path);

    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(new RegExp(`${route.path === "/" ? "/?$" : `${route.path}/?$`}`));
    await expect(page.getByRole("heading", { name: new RegExp(route.heading) }).first()).toBeVisible();
  });
}
