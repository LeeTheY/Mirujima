import { authenticatedClient } from "../_shared/membership.ts";
import { hashFamilyCode } from "../_shared/family-code.ts";

function response(origin: string, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Vary": "Origin"
    }
  });
}

Deno.serve(async (request) => {
  const allowedOrigin = Deno.env.get("MIRUJIMA_APP_ORIGIN") ?? "";
  const requestOrigin = request.headers.get("Origin") ?? "";
  if (!allowedOrigin || requestOrigin !== allowedOrigin) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), { status: 403 });
  }
  if (request.method === "OPTIONS") return response(allowedOrigin, { ok: true });
  if (request.method !== "POST") return response(allowedOrigin, { error: "method_not_allowed" }, 405);

  try {
    const secret = Deno.env.get("MIRUJIMA_SERVER_SIGNING_SECRET") ?? "";
    const body = await request.json().catch(() => ({})) as { code?: unknown };
    if (typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) {
      return response(allowedOrigin, { error: "invalid_code_format" }, 400);
    }
    const { admin, user } = await authenticatedClient(request);
    const { data, error } = await admin.rpc("redeem_family_link_code", {
      p_actor_user_id: user.id,
      p_code_hash: await hashFamilyCode(body.code, secret)
    });
    if (error) throw error;
    if (data?.status === "locked") return response(allowedOrigin, data, 429);
    if (data?.status === "invalid") return response(allowedOrigin, data, 400);
    return response(allowedOrigin, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "family_code_redeem_failed";
    const status = message.includes("active guardian") || message.includes("already exists") ? 409
      : message.includes("로그인") || message.includes("인증") ? 401
        : 400;
    return response(allowedOrigin, { error: "family_code_redeem_failed" }, status);
  }
});
