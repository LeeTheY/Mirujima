import { expect, test } from "@playwright/test";

for (const route of ["/", "/how", "/privacy", "/offline"] as const) {
  test(`${route} 공개 화면은 모바일 폭에서 가로로 넘치지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    await expect(page.getByRole("heading").first()).toBeVisible();
    const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(width.scroll).toBeLessThanOrEqual(width.viewport + 1);
  });
}

test("PWA 공개 리소스는 설치 가능한 manifest와 service worker를 제공한다", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  await expect.poll(async () => (await manifest.json()).display).toBe("standalone");
  const worker = await request.get("/sw.js");
  expect(worker.ok()).toBe(true);
  expect(await worker.text()).toContain("mirujima-shell-v3");
});
