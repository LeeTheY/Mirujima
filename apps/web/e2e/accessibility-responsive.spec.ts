import { expect, test } from "@playwright/test";

for (const width of [320, 390, 768, 1024, 1440, 1920]) for (const route of ["/", "/login", "/how", "/privacy", "/offline"] as const) {
  test(`${route} ${width}px 화면은 가로로 넘치지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route);
    await expect(page.getByRole("heading").first()).toBeVisible();
    const measured = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(measured.scroll).toBeLessThanOrEqual(measured.viewport + 1);
  });
}

test("PWA 공개 리소스는 설치 가능한 manifest와 service worker를 제공한다", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  await expect.poll(async () => (await manifest.json()).display).toBe("standalone");
  const worker = await request.get("/sw.js");
  expect(worker.ok()).toBe(true);
  expect(await worker.text()).toContain("mirujima-shell-v4");
});

test("공개 페이지에서 키보드 초점이 보이고 보호된 주소는 로그인으로 안내한다", async ({ page }) => {
  await page.goto("/how"); await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe("none");
  await page.goto("/wallet/history");
  await expect(page).toHaveURL(/\/login\/?\?next=/);
});

test("공개 안내와 CTA의 일반 텍스트 대비는 4.5 이상이다", async ({ page }) => {
  await page.goto("/");
  const ratios = await page.evaluate(() => {
    const luminance = (color: string) => {
      const values = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((x) => x / 255)
        .map((x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    return [".hero-lead", ".microcopy", ".hero-actions .button:not(.secondary)"].map((selector) => {
      const element = document.querySelector(selector)!;
      const style = getComputedStyle(element); let ancestor = element, background = style.backgroundColor;
      while (background === "rgba(0, 0, 0, 0)" && ancestor.parentElement) {
        ancestor = ancestor.parentElement; background = getComputedStyle(ancestor).backgroundColor;
      }
      const a = luminance(style.color), b = luminance(background);
      return { selector, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    });
  });
  for (const item of ratios) expect(item.ratio, item.selector).toBeGreaterThanOrEqual(4.5);
});
