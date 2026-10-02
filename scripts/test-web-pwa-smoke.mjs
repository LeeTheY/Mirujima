/* global navigator, caches */
import process from "node:process";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { URL } from "node:url";
import { setTimeout } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";

// Requires the actual production Next server. The update fixture changes only a
// comment in the served worker and restores the source even on failure.
const origin = process.env.MIRUJIMA_PWA_TEST_ORIGIN ?? "http://127.0.0.1:3120";
const path = "apps/web/public/sw.js", source = await readFile(path, "utf8");
let server, browser;
try {
  if (!process.env.MIRUJIMA_PWA_TEST_ORIGIN) {
    const next = createRequire(import.meta.url).resolve("next/dist/bin/next", { paths: [process.cwd()+"/apps/web"] });
    server = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", "3120"], { cwd: "apps/web", stdio: "ignore" });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error("Production test server failed to start");
      try { ready = (await globalThis.fetch(origin)).ok; } catch { /* retry local startup */ }
      if (ready) break;
      await setTimeout(100);
    }
    assert(ready, "Production test server did not become ready");
  }
  browser = await chromium.launch();
  const context = await browser.newContext(); const page = await context.newPage();
  await page.goto(origin);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.goto(`${origin}/how`); await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(async () => { await caches.open("another-product-cache"); await caches.open("mirujima-private-obsolete"); });
  const keys = await page.evaluate(async () => (await (await caches.open("mirujima-shell-v4")).keys()).map((r) => new URL(r.url).pathname));
  assert(keys.includes("/how")); assert(keys.every((p) => ["/", "/how", "/privacy", "/offline"].includes(p) || p.startsWith("/_next/static/") || p.startsWith("/icons/")));
  await context.setOffline(true);
  await page.goto(`${origin}/how`); await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto(`${origin}/wallet/charge?paymentKey=test-sensitive`);
  await expect(page.getByRole("heading", { name: "인터넷 연결을 확인해 주세요." })).toBeVisible();
  assert(!(await page.evaluate(async () => (await (await caches.open("mirujima-shell-v4")).keys()).some((r) => r.url.includes("paymentKey") || r.url.includes("/wallet/")))));
  await context.setOffline(false); await page.goto(origin);
  const initialController = await page.evaluate(() => navigator.serviceWorker.controller.scriptURL);
  await writeFile(path, `${source}\n// Local update fixture ${Date.now()}\n`);
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting)), { timeout: 15000 }).toBe(true);
  assert.equal(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL), initialController);
  await expect(page.getByRole("button", { name: "업데이트", exact: true })).toBeVisible();
  await Promise.all([
    page.waitForNavigation({ waitUntil: "load" }),
    page.getByRole("button", { name: "업데이트", exact: true }).click(),
  ]);
  await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting))).toBe(false);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("mirujima-private-obsolete"))).toBe(false);
  assert((await page.evaluate(() => caches.keys())).includes("another-product-cache"));
  process.stdout.write("PASS production SW: installed/controller, public offline page, private payment fallback and no cache, waiting update, explicit activation, own-cache cleanup. Real device installation and push provider delivery remain unverified.\n");
} finally { await writeFile(path, source); await browser?.close(); server?.kill("SIGTERM"); }
