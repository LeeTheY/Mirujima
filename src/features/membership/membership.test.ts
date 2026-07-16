import { describe, expect, it } from "vitest";
import { FREE_MEMBERSHIP, hasPremiumEntitlement, normalizeMembershipSnapshot } from "./types";

describe("Premium feature gate", () => {
  it("does not unlock a feature for a local Free state", () => {
    expect(hasPremiumEntitlement(FREE_MEMBERSHIP, "cloud-sync")).toBe(false);
  });

  it("requires active server membership and the exact entitlement", () => {
    const premium = {
      ...FREE_MEMBERSHIP,
      plan: "premium" as const,
      status: "active" as const,
      entitlements: ["cloud-sync" as const]
    };
    expect(hasPremiumEntitlement(premium, "cloud-sync")).toBe(true);
    expect(hasPremiumEntitlement(premium, "screen-ocr")).toBe(false);
    expect(hasPremiumEntitlement(premium, "content-summary")).toBe(false);
    expect(hasPremiumEntitlement({ ...premium, status: "inactive" }, "cloud-sync")).toBe(false);
  });

  it("falls back safely when the local cache is malformed", () => {
    expect(normalizeMembershipSnapshot({ plan: "premium", status: "active", entitlements: "cloud-sync" })).toEqual({
      ...FREE_MEMBERSHIP,
      plan: "premium",
      status: "active"
    });
  });
});
