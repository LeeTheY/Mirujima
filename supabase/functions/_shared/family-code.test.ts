import { describe, expect, it } from "vitest";
import * as familyCode from "./family-code";

describe("family link code security", () => {
  it("generates exactly six numeric digits", () => {
    const generate = Reflect.get(familyCode, "generateFamilyCode") as () => string;

    for (let index = 0; index < 20; index += 1) {
      expect(generate()).toMatch(/^\d{6}$/);
    }
  });

  it("creates a deterministic 64-character HMAC without exposing the code", async () => {
    const hash = Reflect.get(familyCode, "hashFamilyCode") as (code: string, secret: string) => Promise<string>;

    const first = await hash("836885", "development-secret-with-enough-length");
    const second = await hash("836885", "development-secret-with-enough-length");

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).toBe(second);
    expect(first).not.toContain("836885");
  });

  it("rejects malformed codes and weak signing secrets", async () => {
    const hash = Reflect.get(familyCode, "hashFamilyCode") as (code: string, secret: string) => Promise<string>;

    await expect(hash("12345", "development-secret-with-enough-length")).rejects.toThrow("6자리");
    await expect(hash("123456", "short")).rejects.toThrow("서버 서명 secret");
  });
});
