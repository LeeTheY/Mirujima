import { describe, expect, it } from "vitest";
import { PUBLIC_NAVIGATION } from "./public-navigation";

describe("public navigation", () => {
  it("uses standalone slash routes", () => {
    expect(PUBLIC_NAVIGATION).toEqual([
      { label: "작동 방식", href: "/how" },
      { label: "개인정보", href: "/privacy" },
    ]);
    expect(PUBLIC_NAVIGATION.every((item) => item.href.startsWith("/") && !item.href.includes("#"))).toBe(true);
  });
});
