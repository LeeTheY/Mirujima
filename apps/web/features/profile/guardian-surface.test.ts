import { describe, expect, it } from "vitest";
import { GUARDIAN_SURFACE_SECTIONS } from "./guardian-surface";

describe("guardian dashboard visual structure", () => {
  it("matches the student dashboard section rhythm", () => {
    expect(GUARDIAN_SURFACE_SECTIONS.home).toEqual(["hero", "linked-students", "focus-metrics", "wallet", "family-guide"]);
    expect(GUARDIAN_SURFACE_SECTIONS.students).toEqual(["heading", "student-cards", "reward-requests"]);
    expect(GUARDIAN_SURFACE_SECTIONS.history).toEqual(["heading", "period-filter", "summary-cards", "history-content"]);
  });
});
