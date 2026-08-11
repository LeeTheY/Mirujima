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
  const [membershipResult, deviceResult] = await Promise.all([
    client.rpc("get_effective_membership", { p_user_id: userId }),
    client.from("devices").select("id", { count: "exact", head: true }).eq("user_id", userId)
  ]);
  if (membershipResult.error) throw membershipResult.error;
  if (deviceResult.error) throw deviceResult.error;
  const membership = membershipResult.data as Record<string, unknown> | null;
  const validUntil = typeof membership?.currentPeriodEndsAt === "string" ? membership.currentPeriodEndsAt : null;
  const entitlements = Array.isArray(membership?.entitlements)
    ? membership.entitlements.filter((feature): feature is string => typeof feature === "string")
    : [];
  return {
    plan: membership?.plan ?? "free",
    status: membership?.status ?? "inactive",
    billingIntegration: membership?.status === "active" ? "toss" : null,
    activationSource: membership?.status === "active" ? "toss_payment" : null,
    productCode: membership?.productCode ?? null,
    membershipSource: membership?.source ?? null,
    membershipOwnerUserId: membership?.membershipOwnerUserId ?? null,
    currentPeriodStartedAt: membership?.currentPeriodStartedAt ?? null,
    currentPeriodEndsAt: validUntil,
    includedStudentSeats: membership?.includedStudentSeats ?? 0,
    extraStudentSeats: membership?.extraStudentSeats ?? 0,
    activeStudentCount: membership?.activeStudentCount ?? 0,
    seatCapacity: membership?.seatCapacity ?? 0,
    entitlements: entitlements.map((featureKey) => ({ featureKey, enabled: true, validUntil })),
    deviceCount: deviceResult.count ?? 0
  };
}

export async function assertEntitlement(client: ReturnType<typeof createClient>, userId: string, featureKey: string): Promise<void> {
  const { data, error } = await client.rpc("has_effective_membership_entitlement", {
    p_user_id: userId,
    p_feature_key: featureKey,
  });
  if (error) throw error;
  if (data !== true) {
    throw new Error(`${featureKey} entitlement required`);
  }
}
