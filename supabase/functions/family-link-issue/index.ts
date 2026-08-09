import { authenticatedClient } from "../_shared/membership.ts";
import { generateFamilyCode, hashFamilyCode } from "../_shared/family-code.ts";
import { allowedOrigin } from "../_shared/origin.ts";
import { classifyFamilyIssueFailure } from "../_shared/family-error.ts";

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
    const body = await request.json().catch(() => ({})) as { action?: unknown };
    const { admin, user } = await authenticatedClient(request);
    if (body.action === "cancel") {
      const { data, error } = await admin.rpc("cancel_family_link_code", { p_actor_user_id: user.id });
      if (error) throw error;
      return response(origin, data);
    }
    if (body.action !== undefined && body.action !== "issue") {
      return response(origin, { error: "invalid_action" }, 400);
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = generateFamilyCode();
      const codeHash = await hashFamilyCode(code, secret);
      const { data, error } = await admin.rpc("issue_family_link_code", {
        p_actor_user_id: user.id,
        p_code_hash: codeHash
      });
      if (!error) return response(origin, { ...data, code });
      if (error.code !== "23505") throw error;
    }
    return response(origin, { error: "code_generation_conflict" }, 503);
  } catch (error) {
    const message = error instanceof Error ? error.message : "family_code_issue_failed";
    const { code, status } = classifyFamilyIssueFailure(message);
    console.error(JSON.stringify({ function: "family-link-issue", code, status }));
    return response(origin, { error: code }, status);
  }
});
