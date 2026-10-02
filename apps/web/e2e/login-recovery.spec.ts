import { expect, test } from "@playwright/test";

test("OAuth 취소는 목적지를 보존하고 안전한 재시도 안내를 표시한다", async ({ page }) => {
  await page.goto("/auth/callback?error=access_denied&error_description=private-provider-detail&next=%2Ffocus");
  const url = new URL(page.url());
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("next")).toBe("/focus");
  await expect(page.getByRole("alert", { name: "로그인 오류" })).toContainText("취소");
  await expect(page.getByRole("alert", { name: "로그인 오류" })).not.toContainText("private-provider-detail");
  await expect(page.locator('form input[name="next"]')).toHaveValue("/focus");
});

test("외부 복귀 주소는 OAuth 오류 복구에도 허용하지 않는다", async ({ page }) => {
  await page.goto("/auth/callback?error=access_denied&next=https%3A%2F%2Fevil.test");
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(new URL(page.url()).searchParams.has("next")).toBe(false);
});

test("일회용 코드 없는 콜백은 로그인 실패와 재시도를 안내한다", async ({ page }) => {
  await page.goto("/auth/callback?next=%2Fhistory");
  await expect(page.getByRole("alert", { name: "로그인 오류" })).toContainText("로그인을 완료하지 못했습니다");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/history");
});


test("OAuth fragment 오류는 안전한 코드로 복구하고 원문 fragment를 지운다", async ({ page }) => {
  await page.goto("/auth/callback?next=%2Ffocus#error=access_denied&error_description=private-fragment-detail");
  await expect(page.getByRole("alert", { name: "로그인 오류" })).toContainText("취소");
  expect(new URL(page.url()).hash).toBe("");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/focus");
});
