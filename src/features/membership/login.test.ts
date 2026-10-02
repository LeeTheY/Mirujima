import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ oauth: vi.fn(), exchange: vi.fn(), session: vi.fn(), invoke: vi.fn(), getCache: vi.fn(), setCache: vi.fn(), clearSync: vi.fn(), launch: vi.fn(), profile: vi.fn() }));
vi.mock("./product-config", () => ({ MEMBERSHIP_PRODUCT: { supabaseUrl: "https://fixture.test", supabasePublishableKey: "public-fixture", webAppOrigin: "https://mirujima.vercel.app" }, assertMembershipConfiguration: vi.fn(), membershipCheckoutUrl: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { signInWithOAuth: mocks.oauth, exchangeCodeForSession: mocks.exchange, getSession: mocks.session }, functions: { invoke: mocks.invoke } }) }));
vi.mock("./storage", () => ({ trustedSupabaseStorage: {}, hasStoredSupabaseSession: async () => true, getOrCreateDeviceId: async () => "fixture-device", clearMembershipAccountData: vi.fn(), getMembershipCache: mocks.getCache, setMembershipCache: mocks.setCache }));
vi.mock("../cloud-sync/storage", () => ({ cloudSyncStorage: { clearAccountCache: mocks.clearSync } }));
import { membershipService } from "./service";
import { FREE_MEMBERSHIP } from "./types";
const user = { id: "fixture-user", email: "student@fixture.test" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCache.mockResolvedValue(FREE_MEMBERSHIP);
  mocks.profile.mockResolvedValue({ id: "", email: "" });
  mocks.launch.mockResolvedValue("https://extension.chromiumapp.org/supabase-auth?code=one-use-fixture");
  mocks.oauth.mockResolvedValue({ data: { url: "https://fixture.test/auth/start" }, error: null });
  mocks.exchange.mockResolvedValue({ data: { user }, error: null });
  mocks.session.mockResolvedValue({ data: { session: { user } }, error: null });
  mocks.invoke.mockResolvedValue({ data: { plan: "free", status: "inactive", billingIntegration: null, activationSource: null, currentPeriodStartedAt: null, currentPeriodEndsAt: null, entitlements: [], deviceCount: 1 }, error: null });
  vi.stubGlobal("chrome", { identity: { getProfileUserInfo: mocks.profile, launchWebAuthFlow: mocks.launch, getRedirectURL: () => "https://extension.chromiumapp.org/supabase-auth" }, runtime: { getPlatformInfo: async () => ({ os: "mac" }), getManifest: () => ({ version: "0.1.0" }) } });
});
afterEach(() => vi.unstubAllGlobals());
describe("extension account login", () => {
  it("allows Google login without a signed-in Chrome profile", async () => {
    await expect(membershipService.signIn()).resolves.toMatchObject({ userId: user.id });
    expect(mocks.oauth.mock.calls[0][0].options.queryParams).toEqual({ prompt: "select_account" });
  });
  it("uses Chrome email only as a hint, not as the canonical account identity", async () => {
    mocks.profile.mockResolvedValue({ id: "chrome-profile", email: "other@fixture.test" });
    await expect(membershipService.restore()).resolves.toMatchObject({ userId: user.id, email: user.email });
  });
  it("clears the old account cloud cache when switching authenticated users", async () => {
    mocks.getCache.mockResolvedValue({ ...FREE_MEMBERSHIP, userId: "previous-user", plan: "premium", status: "active", entitlements: ["cloud-sync"] });
    const account = await membershipService.signIn();
    expect(mocks.clearSync).toHaveBeenCalledOnce();
    expect(account.userId).toBe(user.id);
    expect(account.entitlements).toEqual([]);
  });
  it("rejects a callback outside the extension redirect origin before exchanging its code", async () => {
    mocks.launch.mockResolvedValue("https://evil.test/supabase-auth?code=private");
    await expect(membershipService.signIn()).rejects.toThrow("응답 주소");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("does not expose raw provider error descriptions", async () => {
    mocks.launch.mockResolvedValue("https://extension.chromiumapp.org/supabase-auth?error=access_denied&error_description=private-provider-detail");
    await expect(membershipService.signIn()).rejects.toThrow("다시 시도");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
});
