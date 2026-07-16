import { describe, expect, it } from "vitest";
import { includesDomainText, toggleDomainText } from "./site-presets";

describe("사이트 프리셋", () => {
  it("클릭한 도메인을 입력 목록에 추가한다", () => {
    expect(toggleDomainText("github.com", "notion.so")).toBe("github.com\nnotion.so");
  });

  it("이미 선택한 도메인은 다시 클릭하면 제거한다", () => {
    expect(toggleDomainText("github.com\nnotion.so", "github.com")).toBe("notion.so");
  });

  it("URL 형식으로 직접 입력한 값도 선택 상태로 인식한다", () => {
    expect(includesDomainText("https://www.youtube.com/watch?v=1", "youtube.com")).toBe(true);
  });
});
