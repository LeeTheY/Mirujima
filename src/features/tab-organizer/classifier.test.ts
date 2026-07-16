import { describe, expect, it } from "vitest";
import { classifyTab, groupTitle, hostnameFromTabUrl } from "./classifier";
import type { TabClassificationContext, TabContext, UserTabClassificationRule } from "./types";

const context: TabClassificationContext = {
  scheduleId: "schedule-1", scheduleTitle: "영어 드라마 분석", scheduleDescription: "표현 정리",
  activityMode: "watching", blockingMode: "allowlist",
  allowedDomains: [{ hostname: "netflix.com", includeSubdomains: true }],
  blockedDomains: [{ hostname: "instagram.com", includeSubdomains: true }], taskKeywords: ["영어", "드라마"]
};
function tab(hostname: string, patch: Partial<TabContext> = {}): TabContext {
  return { tabId: 1, windowId: 1, index: 0, title: hostname, url: `https://${hostname}/`, hostname, pinned: false, active: false, currentGroupId: -1, ...patch };
}

describe("스마트 탭 분류", () => {
  it("일정 허용 도메인을 일반 휴식 규칙보다 우선한다", () => {
    expect(classifyTab(tab("netflix.com", { openedDuringMode: "break" }), context).category).toBe("work");
  });
  it("일정 차단 도메인을 휴식으로 분류한다", () => {
    expect(classifyTab(tab("instagram.com"), context).category).toBe("break");
  });
  it("일정별 사용자 규칙을 전역 규칙보다 우선한다", () => {
    const now = new Date().toISOString();
    const rules: UserTabClassificationRule[] = [
      { id: "global", hostname: "notion.so", category: "communication", scope: "global", createdAt: now, updatedAt: now },
      { id: "schedule", hostname: "notion.so", category: "reference", scope: "schedule", scheduleId: "schedule-1", createdAt: now, updatedAt: now }
    ];
    expect(classifyTab(tab("notion.so"), context, rules).category).toBe("reference");
  });
  it("휴식 중 열린 Netflix는 허용되지 않은 일정에서 휴식 후보가 된다", () => {
    const withoutNetflix = { ...context, allowedDomains: [] };
    expect(classifyTab(tab("netflix.com", { openedDuringMode: "break" }), withoutNetflix).category).toBe("break");
  });
  it("YouTube처럼 상황 의존적인 도메인은 근거가 부족하면 분류 필요로 둔다", () => {
    expect(classifyTab(tab("youtube.com"), { ...context, allowedDomains: [] }).category).toBe("unclassified");
  });
  it("작업 탭에서 연 공식 문서는 참고 자료로 분류한다", () => {
    expect(classifyTab(tab("developer.mozilla.org"), { ...context, allowedDomains: [] }, [], "work").category).toBe("reference");
  });
  it("제한 URL은 hostname을 만들지 않는다", () => {
    expect(hostnameFromTabUrl("chrome://extensions")).toBeNull();
  });
  it("그룹 제목에 민감한 URL 대신 일정명만 사용한다", () => {
    expect(groupTitle("work", "React 프로젝트")).toBe("🎯 React 프로젝트");
    expect(groupTitle("unclassified")).toBe("📦 분류 필요");
  });
});
