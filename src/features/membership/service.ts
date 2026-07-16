import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MEMBERSHIP_PRODUCT, assertMembershipConfiguration } from "./product-config";
import {
  clearMembershipAccountData,
  getMembershipCache,
  getOrCreateDeviceId,
  hasStoredSupabaseSession,
  setMembershipCache,
  trustedSupabaseStorage
} from "./storage";
import { FREE_MEMBERSHIP, PREMIUM_ENTITLEMENTS, type MembershipSnapshot, type PremiumEntitlement } from "./types";
import { cloudSyncStorage } from "../cloud-sync/storage";

interface EntitlementsResponse {
  plan: "free" | "premium";
  status: "inactive" | "active";
  billingIntegration: "deferred" | "stripe";
  activationSource: "onboarding_deferred" | "stripe_subscription" | null;
  entitlements: Array<{ featureKey: PremiumEntitlement; enabled: boolean; validUntil: string | null }>;
  deviceCount: number;
}

let client: SupabaseClient | null = null;

export function membershipSupabaseClient(): SupabaseClient {
  assertMembershipConfiguration();
  if (!client) {
    client = createClient(MEMBERSHIP_PRODUCT.supabaseUrl, MEMBERSHIP_PRODUCT.supabasePublishableKey, {
      auth: {
        flowType: "pkce",
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: false,
        storageKey: "mirujima:supabase-auth-token",
        storage: trustedSupabaseStorage
      }
    });
  }
  return client;
}

function normalizedEmail(value: string | undefined | null): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

async function chromeAccount(): Promise<{ email: string; id: string }> {
  const profile = await chrome.identity.getProfileUserInfo({ accountStatus: "ANY" });
  return { email: profile.email.trim(), id: profile.id };
}

export async function membershipDevicePayload() {
  const platform = await chrome.runtime.getPlatformInfo();
  return {
    deviceId: await getOrCreateDeviceId(),
    deviceName: `${platform.os} Chrome`,
    extensionVersion: chrome.runtime.getManifest().version
  };
}

async function invokeEntitlements(functionName: "activate-membership" | "get-membership-entitlements"): Promise<EntitlementsResponse> {
  const { data, error } = await membershipSupabaseClient().functions.invoke<EntitlementsResponse>(functionName, {
    body: await membershipDevicePayload()
  });
  if (error) throw new Error(error.message || "멤버십 서버 응답을 확인하지 못했습니다.");
  if (!data) throw new Error("멤버십 서버가 빈 응답을 반환했습니다.");
  return data;
}

async function cacheServerMembership(data: EntitlementsResponse, email: string, userId: string, chromeEmail: string): Promise<MembershipSnapshot> {
  const now = Date.now();
  const entitlements = data.entitlements
    .filter((item) => item.enabled && (!item.validUntil || new Date(item.validUntil).getTime() > now))
    .map((item) => item.featureKey)
    .filter((feature): feature is PremiumEntitlement => PREMIUM_ENTITLEMENTS.includes(feature));
  const membership: MembershipSnapshot = {
    plan: data.plan,
    status: data.status,
    billingIntegration: data.billingIntegration,
    activationSource: data.activationSource,
    userId,
    email,
    chromeAccountEmail: chromeEmail,
    entitlements,
    deviceCount: data.deviceCount,
    lastCheckedAt: new Date().toISOString(),
    error: null
  };
  await setMembershipCache(membership);
  return membership;
}

export const membershipService = {
  async getSnapshot(): Promise<MembershipSnapshot> {
    return getMembershipCache();
  },

  async checkChromeAccount(): Promise<MembershipSnapshot> {
    const account = await chromeAccount();
    const current = await getMembershipCache();
    const next = { ...current, chromeAccountEmail: account.email || null, error: null };
    await setMembershipCache(next);
    return next;
  },

  async signIn(): Promise<MembershipSnapshot> {
    const account = await chromeAccount();
    if (!account.email) throw new Error("Chrome에 로그인된 Google 계정을 찾지 못했습니다.");
    const redirectTo = chrome.identity.getRedirectURL("supabase-auth");
    const { data, error } = await membershipSupabaseClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: { login_hint: account.email, prompt: "select_account" }
      }
    });
    if (error || !data.url) throw new Error(error?.message || "Google 로그인 주소를 만들지 못했습니다.");
    let callbackUrl: string | undefined;
    try {
      callbackUrl = await chrome.identity.launchWebAuthFlow({ url: data.url, interactive: true });
    } catch (cause) {
      throw new Error(cause instanceof Error ? cause.message : "Google 로그인이 취소되었습니다.", { cause });
    }
    if (!callbackUrl) throw new Error("Google 로그인이 완료되지 않았습니다.");
    const callback = new URL(callbackUrl);
    const oauthError = callback.searchParams.get("error_description") || callback.searchParams.get("error");
    if (oauthError) throw new Error(oauthError);
    const code = callback.searchParams.get("code");
    if (!code) throw new Error("Google 로그인 일회용 코드를 받지 못했습니다.");
    const { data: sessionData, error: exchangeError } = await membershipSupabaseClient().auth.exchangeCodeForSession(code);
    if (exchangeError || !sessionData.user) throw new Error(exchangeError?.message || "로그인 세션을 만들지 못했습니다.");
    if (normalizedEmail(sessionData.user.email) !== normalizedEmail(account.email)) {
      await membershipSupabaseClient().auth.signOut();
      await cloudSyncStorage.clearAccountCache();
      await clearMembershipAccountData();
      throw new Error(`Chrome 계정(${account.email})과 Google 로그인 계정(${sessionData.user.email ?? "확인 불가"})이 일치하지 않습니다.`);
    }
    const current = await getMembershipCache();
    const next: MembershipSnapshot = {
      ...current,
      userId: sessionData.user.id,
      email: sessionData.user.email ?? account.email,
      chromeAccountEmail: account.email,
      error: null
    };
    await setMembershipCache(next);
    return next;
  },

  async activate(): Promise<MembershipSnapshot> {
    if (MEMBERSHIP_PRODUCT.billingIntegration !== "deferred") {
      throw new Error("현재 결제 연동 설정에서는 무료 Premium 활성화를 사용할 수 없습니다.");
    }
    const account = await chromeAccount();
    const { data: sessionData } = await membershipSupabaseClient().auth.getSession();
    const user = sessionData.session?.user;
    if (!user) throw new Error("먼저 Google 로그인을 완료해 주세요.");
    if (normalizedEmail(user.email) !== normalizedEmail(account.email)) {
      throw new Error("Chrome 기본 계정과 로그인 계정이 일치하지 않습니다.");
    }
    return cacheServerMembership(await invokeEntitlements("activate-membership"), user.email ?? account.email, user.id, account.email);
  },

  async restore(): Promise<MembershipSnapshot> {
    if (!(await hasStoredSupabaseSession())) {
      await cloudSyncStorage.clearAccountCache();
      await setMembershipCache(FREE_MEMBERSHIP);
      return FREE_MEMBERSHIP;
    }
    const { data, error } = await membershipSupabaseClient().auth.getSession();
    if (error || !data.session?.user) {
      await cloudSyncStorage.clearAccountCache();
      await clearMembershipAccountData();
      return FREE_MEMBERSHIP;
    }
    const account = await chromeAccount();
    if (!account.email || normalizedEmail(data.session.user.email) !== normalizedEmail(account.email)) {
      await membershipSupabaseClient().auth.signOut();
      await cloudSyncStorage.clearAccountCache();
      await clearMembershipAccountData();
      return FREE_MEMBERSHIP;
    }
    try {
      return await cacheServerMembership(
        await invokeEntitlements("get-membership-entitlements"),
        data.session.user.email ?? account.email,
        data.session.user.id,
        account.email
      );
    } catch (cause) {
      const cached = await getMembershipCache();
      const next = { ...cached, error: cause instanceof Error ? cause.message : "멤버십을 복구하지 못했습니다." };
      await setMembershipCache(next);
      return next;
    }
  },

  async signOut(): Promise<MembershipSnapshot> {
    if (await hasStoredSupabaseSession()) await membershipSupabaseClient().auth.signOut();
    await cloudSyncStorage.clearAccountCache();
    await clearMembershipAccountData();
    return FREE_MEMBERSHIP;
  }
};
