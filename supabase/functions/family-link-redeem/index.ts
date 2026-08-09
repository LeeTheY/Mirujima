import { authenticatedClient } from "../_shared/membership.ts";
import { hashFamilyCode } from "../_shared/family-code.ts";
import { allowedOrigin } from "../_shared/origin.ts";

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
  const requestOrigin = request.headers.get("Origin") ?? "";
  const origin = allowedOrigin(requestOrigin, Deno.env.get("MIRUJIMA_ALLOWED_ORIGINS"));
  if (!origin) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), { status: 403 });
  }
  if (request.method === "OPTIONS") return response(origin, { ok: true });
  if (request.method !== "POST") return response(origin, { error: "method_not_allowed" }, 405);

  try {
    const secret = Deno.env.get("MIRUJIMA_SERVER_SIGNING_SECRET") ?? "";
    const body = await request.json().catch(() => ({})) as { code?: unknown };
    if (typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) {
      return response(origin, { error: "invalid_code_format" }, 400);
    }
    const { admin, user } = await authenticatedClient(request);
    const { data, error } = await admin.rpc("redeem_family_link_code", {
      p_actor_user_id: user.id,
      p_code_hash: await hashFamilyCode(body.code, secret)
    });
    if (error) throw error;
    if (data?.status === "locked") return response(origin, { ...data, error: "redeem_locked" }, 429);
    if (data?.status === "invalid") return response(origin, { ...data, error: "code_invalid_or_expired" }, 400);
    return response(origin, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "family_code_redeem_failed";
    const status = message.includes("student role required") ? 403
      : message.includes("active guardian") || message.includes("already exists") ? 409
      : message.includes("로그인") || message.includes("인증") ? 401
        : 400;
    const code = message.includes("student role required") ? "student_role_required"
      : status === 409 ? "active_guardian_exists" : "family_code_redeem_failed";
    console.error(JSON.stringify({ function: "family-link-redeem", code, status }));
    return response(origin, { error: code }, status);
  }
});
