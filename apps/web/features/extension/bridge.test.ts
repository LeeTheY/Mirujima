import { describe, expect, it, vi } from "vitest";
import { checkExtensionConnection, pingExtension, requestFocusSync, requestFocusReconcile, requiresExtension } from "./bridge";

describe("web extension bridge", () => {
  it("requires the extension only for enforced blocking", () => {
    expect(requiresExtension("blocklist")).toBe(true);
    expect(requiresExtension("allowlist")).toBe(true);
    expect(requiresExtension("off")).toBe(false);
  });

  it("sends a versioned ping", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, version: 1, requestId: "request-1", userId: "user-1" });
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
    const send = vi.fn().mockResolvedValue({ ok: true, version: 1, requestId: "request-3", sessionId: "session-1", status: "success" });
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


describe("enforcement application responses", () => {
  it("accepts only a correlated active application response", async () => {
    const response = { ok: true, version: 1, requestId: "request", sessionId: "session", status: "active" };
    await expect(requestFocusSync("id", vi.fn().mockResolvedValue(response), "plan", "session", "request")).resolves.toBeUndefined();
    await expect(requestFocusSync("id", vi.fn().mockResolvedValue({ ...response, requestId: "old" }), "plan", "session", "request")).rejects.toThrow("응답을 확인");
  });
  it("rejects negative responses and different sessions before reporting a start", async () => {
    await expect(requestFocusSync("id", vi.fn().mockResolvedValue({ ok: false }), "plan", "session", "request")).rejects.toThrow("응답을 확인");
    await expect(requestFocusSync("id", vi.fn().mockResolvedValue({ ok: true, version: 1, requestId: "request", sessionId: "other", status: "active" }), "plan", "session", "request")).rejects.toThrow("확인하지 못");
  });
  it("rejects a ping from another logged-in account", async () => {
    await expect(pingExtension("id", vi.fn().mockResolvedValue({ ok: true, version: 1, requestId: "request", userId: "other" }), "request", "owner")).resolves.toBe(false);
  });
  it("times out a silent extension", async () => {
    vi.useFakeTimers();
    try {
      const pending = requestFocusSync("id", () => new Promise(() => {}), "plan", "session", "request");
      const assertion = expect(pending).rejects.toThrow("초과");
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally { vi.useRealTimers(); }
  });
});


describe("connection diagnostics", () => {
  it("distinguishes signed out from unavailable and outdated", async () => {
    const send = vi.fn().mockResolvedValue({ ok: false, version: 1, requestId: "request", code: "AUTH_REQUIRED", error: "private detail" });
    expect((await checkExtensionConnection("id", send, "owner", "request")).status).toBe("signed-out");
    expect((await checkExtensionConnection("id", send, "owner", "request")).message).not.toContain("private detail");
    send.mockResolvedValueOnce({ ok: true });
    expect((await checkExtensionConnection("id", send, "owner", "request")).status).toBe("outdated");
    send.mockRejectedValueOnce(new Error("private chrome detail"));
    expect((await checkExtensionConnection("id", send, "owner", "request")).status).toBe("unavailable");
  });
  it("requires the exact authenticated account", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, version: 1, requestId: "request", userId: "other" });
    expect((await checkExtensionConnection("id", send, "owner", "request")).status).toBe("account-mismatch");
    send.mockResolvedValueOnce({ ok: true, version: 1, requestId: "request", userId: "owner" });
    expect((await checkExtensionConnection("id", send, "owner", "request")).status).toBe("connected");
  });
  it("does not send messages when the extension id is unconfigured", async () => {
    const send = vi.fn();
    expect((await checkExtensionConnection("", send)).status).toBe("unconfigured");
    expect(send).not.toHaveBeenCalled();
  });
});


describe("identity handshake", () => {
  it("sends the expected identity and reports explicit mismatch responses", async () => {
    const send = vi.fn().mockResolvedValue({ ok: false, version: 1, requestId: "identity", code: "ACCOUNT_MISMATCH" });
    expect((await checkExtensionConnection("id", send, "owner", "identity")).status).toBe("account-mismatch");
    expect(send).toHaveBeenCalledWith("id", { type: "mirujima:ping", version: 1, requestId: "identity", expectedUserId: "owner" });
  });
});
