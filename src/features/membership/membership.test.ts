import { describe, expect, it } from "vitest";
import * as productConfig from "./product-config";
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
      plan: "premium"
    });
  });

  it("normalizes Toss periods and expires stale Premium access", () => {
    const active = normalizeMembershipSnapshot({
      plan: "premium", status: "active", billingIntegration: "toss", activationSource: "toss_payment",
      currentPeriodStartedAt: "2099-01-01T00:00:00.000Z", currentPeriodEndsAt: "2099-02-01T00:00:00.000Z",
      entitlements: ["cloud-sync"]
    });
    expect(active.billingIntegration).toBe("toss");
    expect(active.activationSource).toBe("toss_payment");
    expect(active.status).toBe("active");
    expect(normalizeMembershipSnapshot({ ...active, currentPeriodEndsAt: "2000-01-01T00:00:00.000Z" }).status).toBe("inactive");
  });

  it("builds an exact Web checkout URL", () => {
    const checkoutUrl = Reflect.get(productConfig, "membershipCheckoutUrl") as (origin: string) => string;
    expect(checkoutUrl("https://mirujima.vercel.app/")).toBe("https://mirujima.vercel.app/membership/checkout");
    expect(() => checkoutUrl("https://*.vercel.app")).toThrow("origin");
  });
});
