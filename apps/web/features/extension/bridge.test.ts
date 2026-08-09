import { describe, expect, it, vi } from "vitest";
import { pingExtension, requiresExtension } from "./bridge";

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
});
