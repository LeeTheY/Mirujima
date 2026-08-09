export type MembershipPlan = "free" | "premium";
export type BillingIntegration = "toss";
export type MembershipActivationSource = "toss_payment";

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
  billingIntegration: BillingIntegration | null;
  activationSource: MembershipActivationSource | null;
  userId: string | null;
  email: string | null;
  chromeAccountEmail: string | null;
  entitlements: PremiumEntitlement[];
  deviceCount: number;
  lastCheckedAt: string | null;
  currentPeriodStartedAt: string | null;
  currentPeriodEndsAt: string | null;
  error: string | null;
}

export const FREE_MEMBERSHIP: MembershipSnapshot = {
  plan: "free",
  status: "inactive",
  billingIntegration: null,
  activationSource: null,
  userId: null,
  email: null,
  chromeAccountEmail: null,
  entitlements: [],
  deviceCount: 0,
  lastCheckedAt: null,
  currentPeriodStartedAt: null,
  currentPeriodEndsAt: null,
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
  const billingIntegration = input.billingIntegration === "toss" ? "toss" : null;
  const activationSource = input.activationSource === "toss_payment" ? "toss_payment" : null;
  const currentPeriodStartedAt = typeof input.currentPeriodStartedAt === "string" ? input.currentPeriodStartedAt : null;
  const currentPeriodEndsAt = typeof input.currentPeriodEndsAt === "string" ? input.currentPeriodEndsAt : null;
  const periodActive = Boolean(currentPeriodEndsAt && new Date(currentPeriodEndsAt).getTime() > Date.now());
  return {
    plan: input.plan === "premium" ? "premium" : "free",
    status: input.status === "active" && billingIntegration === "toss" && activationSource === "toss_payment" && periodActive ? "active" : "inactive",
    billingIntegration,
    activationSource,
    userId: typeof input.userId === "string" ? input.userId : null,
    email: typeof input.email === "string" ? input.email : null,
    chromeAccountEmail: typeof input.chromeAccountEmail === "string" ? input.chromeAccountEmail : null,
    entitlements,
    deviceCount: typeof input.deviceCount === "number" && input.deviceCount >= 0 ? input.deviceCount : 0,
    lastCheckedAt: typeof input.lastCheckedAt === "string" ? input.lastCheckedAt : null,
    currentPeriodStartedAt,
    currentPeriodEndsAt,
    error: typeof input.error === "string" ? input.error : null
  };
}
