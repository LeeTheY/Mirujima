import { authenticatedClient } from "../_shared/membership.ts";
import { generateFamilyCode, hashFamilyCode } from "../_shared/family-code.ts";

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
    const body = await request.json().catch(() => ({})) as { action?: unknown };
    const { admin, user } = await authenticatedClient(request);
    if (body.action === "cancel") {
      const { data, error } = await admin.rpc("cancel_family_link_code", { p_actor_user_id: user.id });
      if (error) throw error;
      return response(allowedOrigin, data);
    }
    if (body.action !== undefined && body.action !== "issue") {
      return response(allowedOrigin, { error: "invalid_action" }, 400);
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = generateFamilyCode();
      const codeHash = await hashFamilyCode(code, secret);
      const { data, error } = await admin.rpc("issue_family_link_code", {
        p_actor_user_id: user.id,
        p_code_hash: codeHash
      });
      if (!error) return response(allowedOrigin, { ...data, code });
      if (error.code !== "23505") throw error;
    }
    return response(allowedOrigin, { error: "code_generation_conflict" }, 503);
  } catch (error) {
    const message = error instanceof Error ? error.message : "family_code_issue_failed";
    const status = message.includes("rate limit") ? 429
      : message.includes("active guardian") ? 409
        : message.includes("로그인") || message.includes("인증") ? 401
          : 400;
    return response(allowedOrigin, { error: status === 429 ? "issue_rate_limited" : "family_code_issue_failed" }, status);
  }
});
