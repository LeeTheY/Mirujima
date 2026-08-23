import { describe, expect, it } from "vitest";
import { isAllowedExternalSender } from "./external-handler";
import { retainFreshExternalRequestReceipts } from "./external-handler";

describe("external sender validation", () => {
  it("allows only the exact configured origin", () => {
    expect(isAllowedExternalSender("https://mirujima.vercel.app/focus", "https://mirujima.vercel.app")).toBe(true);
    expect(isAllowedExternalSender("https://preview.mirujima.vercel.app/focus", "https://mirujima.vercel.app")).toBe(false);
    expect(isAllowedExternalSender("https://mirujima.vercel.app.evil.test", "https://mirujima.vercel.app")).toBe(false);
  });

  it("rejects missing or invalid urls", () => {
    expect(isAllowedExternalSender(undefined, "https://mirujima.vercel.app")).toBe(false);
    expect(isAllowedExternalSender("not-a-url", "https://mirujima.vercel.app")).toBe(false);
  });
});

describe("external request receipt retention", () => {
  it("keeps only fresh receipts and newest bounded entries", () => {
    const now = Date.parse("2026-08-24T12:00:00.000Z");
    const receipts = Array.from({ length: 105 }, (_, index) => ({
      requestId: `request-${index}`,
      userId: "1d2f2214-6f91-48c0-9898-a403f02af7fc",
      processedAt: new Date(now - index * 1_000).toISOString(),
      response: { ok: true },
    }));
    receipts.push({
      requestId: "expired",
      userId: receipts[0].userId,
      processedAt: new Date(now - 11 * 60 * 1_000).toISOString(),
      response: { ok: true },
    });

    const retained = retainFreshExternalRequestReceipts(receipts, now);
    expect(retained).toHaveLength(100);
    expect(retained[0].requestId).toBe("request-0");
    expect(retained.some((item) => item.requestId === "expired")).toBe(false);
  });
});
