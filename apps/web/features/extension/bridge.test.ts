import { describe, expect, it, vi } from "vitest";
import { pingExtension, requestFocusReconcile, requiresExtension } from "./bridge";

describe("web extension bridge", () => {
  it("requires the extension only for enforced blocking", () => {
    expect(requiresExtension("blocklist")).toBe(true);
    expect(requiresExtension("allowlist")).toBe(true);
    expect(requiresExtension("off")).toBe(false);
  });

  it("sends a versioned ping", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    await expect(pingExtension("extension-id", send, "request-1")).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith("extension-id", {
      type: "mirujima:ping",
      version: 1,
      requestId: "request-1",
    });
  });

  it("treats bridge failures as disconnected", async () => {
    const send = vi.fn().mockRejectedValue(new Error("missing"));
    await expect(pingExtension("extension-id", send, "request-2")).resolves.toBe(false);
  });

  it("requests terminal focus reconciliation without sending settlement data", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    await requestFocusReconcile("extension-id", send, "schedule-1", "session-1", "request-3");
    expect(send).toHaveBeenCalledWith("extension-id", {
      type: "mirujima:focus-reconcile-request",
      version: 1,
      requestId: "request-3",
      scheduleId: "schedule-1",
      sessionId: "session-1",
    });
  });
});
