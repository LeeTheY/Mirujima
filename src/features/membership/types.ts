export type MembershipPlan = "free" | "premium";
export type BillingIntegration = "deferred" | "stripe";
export type MembershipActivationSource = "onboarding_deferred" | "stripe_subscription";

export type PremiumEntitlement =
  | "learning-grass"
  | "cloud-backup"
  | "cloud-sync"
  | "screen-ocr"
  | "grammar-correction"
  | "content-summary";

export const PREMIUM_ENTITLEMENTS: PremiumEntitlement[] = [
  "learning-grass",
  "cloud-backup",
  "cloud-sync",
  "screen-ocr",
  "grammar-correction",
  "content-summary"
];

export interface MembershipSnapshot {
  plan: MembershipPlan;
  status: "inactive" | "active";
  billingIntegration: BillingIntegration;
  activationSource: MembershipActivationSource | null;
  userId: string | null;
  email: string | null;
  chromeAccountEmail: string | null;
  entitlements: PremiumEntitlement[];
  deviceCount: number;
  lastCheckedAt: string | null;
  error: string | null;
}

export const FREE_MEMBERSHIP: MembershipSnapshot = {
  plan: "free",
  status: "inactive",
  billingIntegration: "deferred",
  activationSource: null,
  userId: null,
  email: null,
  chromeAccountEmail: null,
  entitlements: [],
  deviceCount: 0,
  lastCheckedAt: null,
  error: null
};

export function hasPremiumEntitlement(
  membership: MembershipSnapshot,
  feature: PremiumEntitlement
): boolean {
  return membership.plan === "premium"
    && membership.status === "active"
    && membership.entitlements.includes(feature);
}

export function normalizeMembershipSnapshot(value: unknown): MembershipSnapshot {
  if (!value || typeof value !== "object") return FREE_MEMBERSHIP;
  const input = value as Partial<MembershipSnapshot>;
  const entitlements = Array.isArray(input.entitlements)
    ? input.entitlements.filter((item): item is PremiumEntitlement => PREMIUM_ENTITLEMENTS.includes(item as PremiumEntitlement))
    : [];
  return {
    plan: input.plan === "premium" ? "premium" : "free",
    status: input.status === "active" ? "active" : "inactive",
    billingIntegration: input.billingIntegration === "stripe" ? "stripe" : "deferred",
    activationSource: input.activationSource === "onboarding_deferred" || input.activationSource === "stripe_subscription" ? input.activationSource : null,
    userId: typeof input.userId === "string" ? input.userId : null,
    email: typeof input.email === "string" ? input.email : null,
    chromeAccountEmail: typeof input.chromeAccountEmail === "string" ? input.chromeAccountEmail : null,
    entitlements,
    deviceCount: typeof input.deviceCount === "number" && input.deviceCount >= 0 ? input.deviceCount : 0,
    lastCheckedAt: typeof input.lastCheckedAt === "string" ? input.lastCheckedAt : null,
    error: typeof input.error === "string" ? input.error : null
  };
}
