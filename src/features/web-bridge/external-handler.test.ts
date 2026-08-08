import { describe, expect, it } from "vitest";
import { isAllowedExternalSender } from "./external-handler";

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
