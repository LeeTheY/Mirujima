import { describe, expect, it } from "vitest";
import { destinationForRole, resolvePersistedRole, resolveRoleSelection } from "./role-routing";

describe("role destination", () => {
  it("routes students and guardians to their own home", () => {
    expect(destinationForRole("student")).toBe("/home");
    expect(destinationForRole("guardian")).toBe("/guardian");
  });

  it("routes incomplete profiles to onboarding", () => {
    expect(destinationForRole(null)).toBe("/onboarding");
  });

  it("preserves an existing role instead of attempting to overwrite it", () => {
    expect(resolveRoleSelection("guardian", "student")).toEqual({
      role: "guardian",
      shouldPersist: false,
    });
  });

  it("persists the requested role when the profile is incomplete", () => {
    expect(resolveRoleSelection(null, "student")).toEqual({
      role: "student",
      shouldPersist: true,
    });
  });

  it("routes with the role returned by the database RPC", () => {
    expect(resolvePersistedRole({ role: "guardian", rolePreserved: true }))
      .toBe("guardian");
  });

  it("rejects a successful RPC response that did not persist a role", () => {
    expect(resolvePersistedRole({ role: null, onboardingCompleted: true })).toBeNull();
  });
});
