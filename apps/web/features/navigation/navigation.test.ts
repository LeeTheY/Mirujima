import { describe, expect, it } from "vitest";
import * as navigation from "./navigation";

describe("role navigation", () => {
  it("uses the required student tabs", () => {
    const items = Reflect.get(navigation, "navigationForRole")("student");
    expect(items.map((item: { label: string }) => item.label)).toEqual(["홈", "집중", "기록", "마이페이지"]);
    expect(items.map((item: { href: string }) => item.href)).toEqual(["/home", "/focus", "/history", "/my"]);
  });

  it("uses the required guardian tabs", () => {
    const items = Reflect.get(navigation, "navigationForRole")("guardian");
    expect(items.map((item: { label: string }) => item.label)).toEqual(["홈", "학생", "기록", "마이페이지"]);
    expect(items.map((item: { href: string }) => item.href)).toEqual([
      "/guardian",
      "/guardian/students",
      "/guardian/history",
      "/guardian/my",
    ]);
  });
});
