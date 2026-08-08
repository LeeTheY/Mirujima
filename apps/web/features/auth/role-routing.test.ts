import { describe, expect, it } from "vitest";
import { destinationForRole } from "./role-routing";

describe("role destination", () => {
  it("routes students and guardians to their own home", () => {
    expect(destinationForRole("student")).toBe("/home");
    expect(destinationForRole("guardian")).toBe("/guardian");
  });

  it("routes incomplete profiles to onboarding", () => {
    expect(destinationForRole(null)).toBe("/onboarding");
  });
});
