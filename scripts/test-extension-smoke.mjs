import process from "node:process";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { chromium, expect } from "@playwright/test";

// Uses an isolated profile and local-only fixtures. No Google login, remote
// canonical session or financial mutation is performed by this smoke test.
const extensionDir = resolve(process.env.MIRUJIMA_EXTENSION_DIR ?? "dist-dev");
const webOrigin = process.env.MIRUJIMA_EXTENSION_WEB_ORIGIN ?? "http://localhost:3000";
assert(["http://localhost:3000", "http://127.0.0.1:3000"].includes(webOrigin));
const otherOrigin = webOrigin.includes("localhost") ? "http://127.0.0.1:3000" : "http://localhost:3000";
const manifest = JSON.parse(await readFile(join(extensionDir, "manifest.json"), "utf8"));
assert(manifest.externally_connectable.matches.includes(`${webOrigin}/*`), "Build a development extension with the matching local Web origin first.");
const profile = await mkdtemp(join(tmpdir(), "mirujima-extension-smoke-"));
const server = createServer((_request, response) => { response.writeHead(200, { "Content-Type": "text/html" }); response.end("<!doctype html><html><body><h1>Local smoke fixture</h1></body></html>"); });
let context;
let passed = 0;
const pass = (name) => { passed++; process.stdout.write(`PASS ${name}\n`); };
try {
  await new Promise((resolveListen, reject) => { server.once("error", reject); server.listen(3000, "127.0.0.1", resolveListen); });
  const launch = () => chromium.launchPersistentContext(profile, { channel: "chromium", headless: true, args: [
    `--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`,
    "--host-resolver-rules=MAP focus-fixture.test 127.0.0.1", "--no-proxy-server",
  ] });
  context = await launch();
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const extensionId = worker.url().split("/")[2];
  process.stdout.write(`Extension ID: ${extensionId}\n`);
  let popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole("button", { name: "Google로 로그인" })).toBeVisible();
  pass("extension popup exposes account login without a Chrome profile");

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  for (const width of [320, 380, 480]) {
    await panel.setViewportSize({ width, height: 760 });
    for (const label of ["집중", "탭 정리", "기록", "바로가기"]) {
      await panel.getByRole("navigation").getByRole("button", { name: label, exact: true }).click();
      await expect(panel.getByRole("heading", { name: label === "기록" ? "집중 기록" : label, exact: true })).toBeVisible();
      const layout = await panel.evaluate(() => {
        const brand = globalThis.document.querySelector(".brand-copy strong");
        const accent = globalThis.document.querySelector(".brand-accent");
        const brandRect = brand.getBoundingClientRect();
        const accentRect = accent.getBoundingClientRect();
        return { overflow: globalThis.document.documentElement.scrollWidth > globalThis.innerWidth,
          brandText: brand.textContent.trim(),
          sameLine: accentRect.top >= brandRect.top && accentRect.bottom <= brandRect.bottom + 1,
          titleSize: parseFloat(globalThis.getComputedStyle(globalThis.document.querySelector(".page-title")).fontSize),
          largeButtons: [...globalThis.document.querySelectorAll(".button")].some((button) => button.getBoundingClientRect().height > 48) };
      });
      assert.equal(layout.brandText, "미루지마");
      assert.equal(layout.sameLine, true);
      assert.equal(layout.overflow, false);
      assert.equal(layout.largeButtons, false);
      assert(layout.titleSize <= 24);
      if (process.env.MIRUJIMA_EXTENSION_SCREENSHOT_DIR) await panel.screenshot({ path: join(process.env.MIRUJIMA_EXTENSION_SCREENSHOT_DIR, `extension-${width}-${label}.png`), fullPage: true, animations: "disabled" });
    }
  }
  await panel.getByRole("navigation").getByRole("button", { name: "바로가기", exact: true }).click();
  const pagesBefore = context.pages().length;
  await panel.getByRole("button", { name: "집중 기록" }).click();
  await expect.poll(() => context.pages().length).toBe(pagesBefore + 1);
  const openedWeb = context.pages().at(-1);
  await expect(openedWeb).toHaveURL(`${webOrigin}/history`);
  await openedWeb.close();
  await panel.close();
  pass("panel keeps brand on one line, compact controls and no overflow across three widths; web shortcut opens the correct route");

  const web = await context.newPage();
  await web.goto(webOrigin);
  const response = await web.evaluate(async (id) => globalThis.chrome.runtime.sendMessage(id, { type: "mirujima:ping", version: 1, requestId: "smoke-ping" }), extensionId);
  assert.equal(response.ok, false); assert.equal(response.code, "AUTH_REQUIRED"); assert.equal(response.requestId, "smoke-ping");
  pass("real web external message receives correlated signed-out response");
  await web.goto(otherOrigin);
  const wrongOrigin = await web.evaluate(async (id) => globalThis.chrome.runtime.sendMessage(id, { type: "mirujima:ping", version: 1, requestId: "wrong-origin" }), extensionId);
  assert.equal(wrongOrigin.ok, false); assert.match(wrongOrigin.error, /origin/);
  pass("runtime rejects a different origin even when development manifest permits it");
  await web.close();

  const send = async (message) => {
    const response = await popup.evaluate(async (payload) => globalThis.chrome.runtime.sendMessage(payload), message);
    assert.equal(response?.ok, true, response?.error ?? "Extension action failed");
    return response.data;
  };
  const rules = () => popup.evaluate(() => globalThis.chrome.declarativeNetRequest.getSessionRules());
  for (const mode of ["blocklist", "allowlist", "off"]) {
    const now = new Date();
    const schedule = {
      id: `smoke-${mode}`, title: `Smoke ${mode}`, description: "Local regression fixture", dateKey: now.toISOString().slice(0, 10),
      startAt: now.toISOString(), endAt: new Date(now.getTime() + 300_000).toISOString(), targetFocusMinutes: 5,
      activityMode: "interactive", blockingMode: mode, allowedDomains: [{ hostname: "study-fixture.test", includeSubdomains: false }],
      blockedDomains: [{ hostname: "focus-fixture.test", includeSubdomains: false }], breakMinutes: 5,
      goals: Array.from({ length: 5 }, (_, index) => ({ id: `goal-${index}`, name: `세부 목표 ${index + 1}`, detail: "", minutes: 1, priority: "medium" })),
      status: "scheduled", snoozeCount: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(),
    };
    await send({ type: "SCHEDULE_CREATE", payload: schedule });
    await send({ type: "FOCUS_START", scheduleId: schedule.id, organizeTabs: false });
    if (mode !== "off") assert((await rules()).length > 0);
    else assert.equal((await rules()).length, 0);
    if (mode === "blocklist") {
      const activePanel = await context.newPage();
      await activePanel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
      for (const width of [320, 480]) {
        await activePanel.setViewportSize({ width, height: 760 });
        await expect(activePanel.locator(".focus-timer")).toBeVisible();
        await expect(activePanel.locator(".preview-goals li")).toHaveCount(5);
        assert.equal(await activePanel.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
        if (process.env.MIRUJIMA_EXTENSION_SCREENSHOT_DIR) await activePanel.screenshot({ path: join(process.env.MIRUJIMA_EXTENSION_SCREENSHOT_DIR, `extension-active-${width}.png`), fullPage: true, animations: "disabled" });
        await activePanel.getByRole("navigation").getByRole("button", { name: "탭 정리", exact: true }).click();
        await expect(activePanel.getByRole("button", { name: "지금 탭 정리" })).toBeVisible();
        assert.equal(await activePanel.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
        if (process.env.MIRUJIMA_EXTENSION_SCREENSHOT_DIR) await activePanel.screenshot({ path: join(process.env.MIRUJIMA_EXTENSION_SCREENSHOT_DIR, `extension-tabs-active-${width}.png`), fullPage: true, animations: "disabled" });
        await activePanel.getByRole("navigation").getByRole("button", { name: "집중", exact: true }).click();
      }
      await activePanel.close();
      if (process.env.MIRUJIMA_EXTENSION_SCREENSHOT_DIR) await popup.locator(".popup").screenshot({ path: join(process.env.MIRUJIMA_EXTENSION_SCREENSHOT_DIR, "extension-popup-active.png"), animations: "disabled" });
      pass("active timer and tab organizer remain contained at narrow panel widths");
    }
    const fixture = await context.newPage();
    await fixture.goto("http://focus-fixture.test:3000");
    if (mode === "off") await expect(fixture).toHaveURL(/focus-fixture\.test/);
    else await expect(fixture).toHaveURL(new RegExp(`chrome-extension://${extensionId}/blocked\\.html`));
    await fixture.close();
    // The control plane stays reachable even in allowlist mode.
    const control = await context.newPage();
    await control.goto(`${webOrigin}/focus`);
    await expect(control).toHaveURL(`${webOrigin}/focus`);
    await control.close();
    pass(`real navigation enforces ${mode} and keeps the control plane accessible`);
    await send({ type: "FOCUS_PAUSE" });
    assert.equal((await rules()).length, 0);
    await send({ type: "FOCUS_RESUME" });
    if (mode === "blocklist") {
      await context.close();
      context = await launch();
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      assert.equal(worker.url().split("/")[2], extensionId);
      popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await expect.poll(async () => (await rules()).length).toBeGreaterThan(0);
      const restored = await send({ type: "APP_BOOTSTRAP" });
      assert.equal(restored.activeSession.scheduleId, schedule.id);
      pass("browser restart restores the local focus session and DNR rules");
    }
    await send({ type: "FOCUS_FINISH", result: "incomplete" });
    assert.equal((await rules()).length, 0);
    await send({ type: "SCHEDULE_DELETE", scheduleId: schedule.id });
  }
  pass("pause and finish remove DNR rules for all modes");
  const owner = "f3111111-1111-4111-8111-111111111111";
  const breakFixtureNow = Date.now();
  const breakEnd = new Date(breakFixtureNow - 5000).toISOString();
  const breakStart = new Date(breakFixtureNow - 65000).toISOString();
  const canonicalSchedule = { id: "canonical-break-fixture", ownerUserId: owner, title: "Offline break recovery", description: "Isolated local fixture", dateKey: breakEnd.slice(0, 10),
    startAt: breakStart, endAt: new Date(Date.parse(breakEnd) + 300000).toISOString(), targetFocusMinutes: 5,
    activityMode: "interactive", blockingMode: "blocklist", allowedDomains: [], blockedDomains: [{ hostname: "focus-fixture.test", includeSubdomains: false }],
    breakMinutes: 1, status: "paused", snoozeCount: 0, createdAt: breakStart, updatedAt: breakStart };
  const canonicalSession = { id: "canonical-break-session", scheduleId: canonicalSchedule.id, dateKey: canonicalSchedule.dateKey,
    startedAt: breakStart, endsAt: canonicalSchedule.endAt, endedAt: null, pausedAt: breakStart,
    accumulatedFocusSeconds: 0, distractionSeconds: 0, idleSeconds: 0, blockedAttemptCount: 0, checkInCount: 0,
    status: "paused", breakStartedAt: breakStart, breakEndsAt: breakEnd, accumulatedBreakSeconds: 0,
    canonical: true, canonicalStatus: "paused", canonicalUpdatedAt: breakStart, remainingFocusSeconds: 300,
    selfDepositPoints: 0, depositPolicy: { version: 2, mode: "all-or-none" } };
  await popup.evaluate(async ({ schedule, session, owner }) => globalThis.chrome.storage.local.set({
    "mirujima:schedules": [schedule], "mirujima:active-session": session, "mirujima:canonical-runtime-user-id": owner,
  }), { schedule: canonicalSchedule, session: canonicalSession, owner });
  await context.close();
  context = await launch();
  await (context.serviceWorkers()[0] ?? context.waitForEvent("serviceworker"));
  popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect.poll(async () => (await rules()).length).toBeGreaterThan(0);
  const recovered = await send({ type: "APP_BOOTSTRAP" });
  assert.equal(recovered.activeSession.status, "active");
  assert.equal(recovered.activeSession.endsAt, canonicalSchedule.endAt);
  assert.equal(recovered.activeSession.accumulatedBreakSeconds, 60);
  const blockedAfterBreak = await context.newPage();
  await blockedAfterBreak.goto("http://focus-fixture.test:3000");
  await expect(blockedAfterBreak).toHaveURL(new RegExp(`chrome-extension://${extensionId}/blocked\\.html`));
  pass("expired canonical break restores DNR and absolute timer on offline restart");
  process.stdout.write(`Extension smoke passed: ${passed}\n`);
} finally {
  await context?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(profile, { recursive: true, force: true });
}
