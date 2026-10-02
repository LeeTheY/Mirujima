import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDiscoveredExtension, discoverInstalledExtension } from "./discovery";

afterEach(() => { clearDiscoveredExtension(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("installed extension discovery", () => {
  it("accepts only correlated messages from this window and exact origin", async () => {
    let receive: (event: unknown) => void = () => {};
    let requestId = "";
    const id = "a".repeat(32);
    const win = { location: { origin: "https://mirujima.vercel.app" }, setTimeout, clearTimeout,
      addEventListener: (_: string, listener: typeof receive) => { receive = listener; }, removeEventListener: vi.fn(),
      postMessage: (message: { requestId: string }) => { requestId = message.requestId; } };
    vi.stubGlobal("window", win);
    const pending = discoverInstalledExtension();
    const event = { source: win, origin: win.location.origin, data: { type: "mirujima:extension-discovered", requestId, extensionId: id } };
    receive({ ...event, origin: "https://evil.test" });
    receive({ ...event, source: {} });
    receive({ ...event, data: { ...event.data, requestId: "other" } });
    receive({ ...event, data: { ...event.data, extensionId: "invalid" } });
    expect(win.removeEventListener).not.toHaveBeenCalled();
    receive(event);
    await expect(pending).resolves.toBe(id);
    await expect(discoverInstalledExtension()).resolves.toBe(id);
    expect(win.removeEventListener).toHaveBeenCalledOnce();
  });
  it("falls back after a bounded wait when no extension answers", async () => {
    vi.useFakeTimers();
    const remove = vi.fn();
    vi.stubGlobal("window", { location: { origin: "https://mirujima.vercel.app" }, setTimeout, clearTimeout, addEventListener: vi.fn(), removeEventListener: remove, postMessage: vi.fn() });
    const pending = discoverInstalledExtension();
    await vi.advanceTimersByTimeAsync(1200);
    await expect(pending).resolves.toBeNull();
    expect(remove).toHaveBeenCalledOnce();
  });
});
