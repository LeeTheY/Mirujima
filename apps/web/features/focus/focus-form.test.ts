import { describe, expect, it } from "vitest";
import { parseFocusDraft } from "./focus-form";

describe("focus plan form", () => {
  it("normalizes valid input", () => {
    const result = parseFocusDraft({
      title: "수학 문제 풀이",
      targetFocusMinutes: "50",
      breakMinutes: "10",
      blockingMode: "blocklist",
      domains: "youtube.com, www.instagram.com",
    });
    expect(result).toEqual({
      title: "수학 문제 풀이",
      targetFocusMinutes: 50,
      breakMinutes: 10,
      blockingMode: "blocklist",
      domains: ["youtube.com", "instagram.com"],
    });
  });

  it("rejects invalid duration", () => {
    expect(() => parseFocusDraft({
      title: "공부",
      targetFocusMinutes: "0",
      breakMinutes: "10",
      blockingMode: "off",
      domains: "",
    })).toThrow("집중 시간");
  });
});
