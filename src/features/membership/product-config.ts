import type { BillingIntegration } from "./types";

function env(name: keyof ImportMetaEnv): string {
  return String(import.meta.env[name] ?? "").trim();
}

const billing = env("VITE_BILLING_INTEGRATION");

export const MEMBERSHIP_PRODUCT = {
  monthlyPriceLabel: env("VITE_PREMIUM_MONTHLY_PRICE_LABEL") || "월 가격 미설정",
  billingIntegration: (billing === "stripe" ? "stripe" : "deferred") as BillingIntegration,
  supabaseUrl: env("VITE_SUPABASE_URL"),
  supabasePublishableKey: env("VITE_SUPABASE_PUBLISHABLE_KEY")
} as const;

export function assertMembershipConfiguration(): void {
  if (!MEMBERSHIP_PRODUCT.supabaseUrl || !MEMBERSHIP_PRODUCT.supabasePublishableKey) {
    throw new Error("Premium 연결에 필요한 Supabase 환경 변수가 설정되지 않았습니다.");
  }
  if (!env("VITE_PREMIUM_MONTHLY_PRICE_LABEL")) {
    throw new Error("Premium 월 가격 표시가 설정되지 않았습니다.");
  }
}
