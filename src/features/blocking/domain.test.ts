import { describe, expect, it } from "vitest";
import { isTemporaryAllowActive, matchesDomain, normalizeHostname, parseDomainList, shouldBlockHostname } from "./domain";

describe("도메인 처리", () => {
  it("프로토콜, 경로, query와 www를 제거한다", () => {
    expect(normalizeHostname("HTTPS://WWW.Example.com/path?q=secret#hash")).toBe("example.com");
  });
  it("잘못된 입력을 거부한다", () => expect(() => normalizeHostname("not a domain")).toThrow());
  it("서브도메인 정책에 따라 매칭한다", () => {
    expect(matchesDomain("docs.example.com", { hostname: "example.com", includeSubdomains: true })).toBe(true);
    expect(matchesDomain("docs.example.com", { hostname: "example.com", includeSubdomains: false })).toBe(false);
  });
  it("중복 도메인을 제거한다", () => expect(parseDomainList("www.example.com, example.com")).toHaveLength(1));
  it("allowlist와 blocklist를 판정한다", () => {
    const rule = [{ hostname: "example.com", includeSubdomains: true }];
    expect(shouldBlockHostname("other.com", "allowlist", rule, [])).toBe(true);
    expect(shouldBlockHostname("example.com", "allowlist", rule, [])).toBe(false);
    expect(shouldBlockHostname("example.com", "blocklist", [], rule)).toBe(true);
  });
  it("임시 허용 만료를 반영한다", () => {
    const now = Date.parse("2026-07-14T00:00:00Z");
    const allow = { hostname: "example.com", sessionId: "s", reason: "test", expiresAt: "2026-07-14T00:01:00Z" };
    expect(isTemporaryAllowActive(allow, now)).toBe(true);
    expect(isTemporaryAllowActive(allow, now + 120_000)).toBe(false);
    expect(shouldBlockHostname("example.com", "blocklist", [], [{ hostname: "example.com", includeSubdomains: true }], [allow], now)).toBe(false);
  });
});
