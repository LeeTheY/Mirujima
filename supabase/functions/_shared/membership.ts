import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

export async function authenticatedClient(request: Request) {
  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  if (!authorization || !url || !publishableKey || !serviceRoleKey) throw new Error("인증 설정이 올바르지 않습니다.");
  const client = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("로그인이 필요합니다.");
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { client, admin, user: data.user };
}

interface DeviceInput {
  deviceId?: unknown;
  deviceName?: unknown;
  extensionVersion?: unknown;
}

export async function registerDevice(client: ReturnType<typeof createClient>, userId: string, body: DeviceInput): Promise<void> {
  if (typeof body.deviceId !== "string" || !body.deviceId || body.deviceId.length > 200) return;
  const deviceName = typeof body.deviceName === "string" ? body.deviceName.slice(0, 120) : "Chrome";
  const extensionVersion = typeof body.extensionVersion === "string" ? body.extensionVersion.slice(0, 40) : "unknown";
  const now = new Date().toISOString();
  const { error } = await client.from("devices").upsert({
    user_id: userId,
    client_generated_device_id: body.deviceId,
    device_name: deviceName,
    extension_version: extensionVersion,
    last_seen_at: now,
    updated_at: now
  }, { onConflict: "user_id,client_generated_device_id" });
  if (error) throw error;
}

export async function membershipResponse(client: ReturnType<typeof createClient>, userId: string) {
  const [membershipResult, entitlementResult, deviceResult] = await Promise.all([
    client.from("memberships").select("plan,status,billing_integration,activation_source").eq("user_id", userId).maybeSingle(),
    client.from("membership_entitlements").select("feature_key,enabled,valid_until").eq("user_id", userId),
    client.from("devices").select("id", { count: "exact", head: true }).eq("user_id", userId)
  ]);
  if (membershipResult.error) throw membershipResult.error;
  if (entitlementResult.error) throw entitlementResult.error;
  if (deviceResult.error) throw deviceResult.error;
  const membership = membershipResult.data;
  return {
    plan: membership?.plan ?? "free",
    status: membership?.status ?? "inactive",
    billingIntegration: membership?.billing_integration ?? "deferred",
    activationSource: membership?.activation_source ?? null,
    entitlements: (entitlementResult.data ?? []).map((item) => ({
      featureKey: item.feature_key,
      enabled: item.enabled,
      validUntil: item.valid_until
    })),
    deviceCount: deviceResult.count ?? 0
  };
}

export async function assertEntitlement(client: ReturnType<typeof createClient>, userId: string, featureKey: string): Promise<void> {
  const now = new Date().toISOString();
  const [membership, entitlement] = await Promise.all([
    client.from("memberships").select("plan,status").eq("user_id", userId).maybeSingle(),
    client.from("membership_entitlements").select("enabled,valid_until").eq("user_id", userId).eq("feature_key", featureKey).maybeSingle()
  ]);
  if (membership.error || entitlement.error) throw membership.error ?? entitlement.error;
  if (membership.data?.plan !== "premium" || membership.data.status !== "active" || !entitlement.data?.enabled
    || (entitlement.data.valid_until && entitlement.data.valid_until <= now)) {
    throw new Error(`${featureKey} entitlement required`);
  }
}
