import { describe, expect, it } from "vitest";
import { resolveAccess, roleRedirect, routeAccess } from "./route-access";

describe("role route access", () => {
  it("redirects a guardian from the student my page", () => {
    expect(roleRedirect("/my", "guardian")).toBe("/guardian/my");
  });

  it("redirects a student from the guardian my page", () => {
    expect(roleRedirect("/guardian/my", "student")).toBe("/my");
  });

  it("redirects role-mismatched feature routes to the matching home", () => {
    expect(roleRedirect("/focus", "guardian")).toBe("/guardian");
    expect(roleRedirect("/guardian/students", "student")).toBe("/home");
  });

  it("allows shared authenticated routes for either role", () => {
    expect(roleRedirect("/wallet/charge", "guardian")).toBeNull();
    expect(roleRedirect("/membership/checkout/success", "student")).toBeNull();
  });

  it("classifies public routes without requiring a role", () => {
    expect(routeAccess("/privacy")).toBe("public");
    expect(routeAccess("/how")).toBe("public");
  });

  it("sends missing authentication or profile roles to onboarding", () => {
    expect(resolveAccess("/home", null, "student")).toEqual({ redirectTo: "/onboarding" });
    expect(resolveAccess("/home", "user-id", null)).toEqual({ redirectTo: "/onboarding" });
  });

  it("returns the validated role or its role redirect", () => {
    expect(resolveAccess("/focus", "user-id", "student")).toEqual({ role: "student" });
    expect(resolveAccess("/focus", "user-id", "guardian")).toEqual({ redirectTo: "/guardian" });
  });
});
