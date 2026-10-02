import { describe, expect, it } from "vitest";
import { destinationAfterLogin, loginErrorMessage, loginHref, safeLoginDestination } from "./login-destination";

describe("login destination boundaries", () => {
  it("preserves allowed internal paths and history filters", () => {
    expect(safeLoginDestination("/history?period=weekly&date=2026-10-02")).toBe("/history?period=weekly&date=2026-10-02");
    expect(loginHref("/focus")).toBe("/login?next=%2Ffocus");
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/%5cevil.test", "/focus%0d%0a", "/auth/callback?code=secret", "/login?next=/focus", "/not-a-feature", "/%2f%2fevil.test", "/focus\n", "/focus%ZZ"])("rejects unsafe or recursive destination %s", (value) => {
    expect(safeLoginDestination(value)).toBeNull();
  });
  it("rechecks role permission after login", () => {
    expect(destinationAfterLogin("guardian", "/focus")).toBe("/guardian");
    expect(destinationAfterLogin("student", "/guardian/my")).toBe("/my");
    expect(destinationAfterLogin("guardian", "/wallet/charge")).toBe("/wallet/charge");
    expect(destinationAfterLogin(null, "/focus")).toBe("/login?next=%2Ffocus");
  });
  it("preserves wallet history and owned transaction lookup through login for both roles", () => {
    const destination = "/wallet/history?transaction=11111111-1111-4111-8111-111111111111";
    expect(safeLoginDestination(destination)).toBe(destination);
    expect(destinationAfterLogin("student", destination)).toBe(destination);
    expect(destinationAfterLogin("guardian", destination)).toBe(destination);
  });
  it("does not render arbitrary provider errors", () => {
    expect(loginErrorMessage("secret SQL error")).toBeNull();
    expect(loginErrorMessage("cancelled")).toContain("취소");
  });
});
