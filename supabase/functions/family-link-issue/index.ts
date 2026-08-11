import { authenticatedClient } from "../_shared/membership.ts";
import { generateFamilyCode, hashFamilyCode } from "../_shared/family-code.ts";
import { allowedOrigin } from "../_shared/origin.ts";
import { classifyFamilyIssueFailure, familyFailureMessage } from "../_shared/family-error.ts";

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
  let failureStage = "request";
  const requestOrigin = request.headers.get("Origin") ?? "";
  const origin = allowedOrigin(requestOrigin, Deno.env.get("MIRUJIMA_ALLOWED_ORIGINS"));
  if (!origin) {
    return response(requestOrigin, { error: "origin_not_allowed" }, 403);
  }
  if (request.method === "OPTIONS") return response(origin, { ok: true });
  if (request.method !== "POST") return response(origin, { error: "method_not_allowed" }, 405);

  try {
    failureStage = "authentication";
    const secret = Deno.env.get("MIRUJIMA_SERVER_SIGNING_SECRET") ?? "";
    const body = await request.json().catch(() => ({})) as { action?: unknown };
    const { client, admin, user } = await authenticatedClient(request);
    const accountFingerprint = user.id.slice(-12);
    failureStage = "profile_lookup";
    const { data: actorProfile, error: profileError } = await client
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (actorProfile?.role !== "guardian") {
      return response(origin, {
        error: "guardian_role_required",
        diagnosticCode: `profile_${actorProfile?.role ?? "missing"}-${accountFingerprint}`,
      }, 403);
    }
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
      failureStage = "code_hash";
      const codeHash = await hashFamilyCode(code, secret);
      failureStage = "issue_rpc";
      const { data, error } = await admin.rpc("issue_family_link_code", {
        p_actor_user_id: user.id,
        p_code_hash: codeHash
      });
      if (!error) return response(origin, { ...data, code });
      if (error.code === "P0001" && typeof error.message === "string" && error.message.includes("guardian role required")) {
        throw { ...error, message: "guardian role inconsistent" };
      }
      if (error.code !== "23505") throw error;
    }
    return response(origin, { error: "code_generation_conflict" }, 503);
  } catch (error) {
    const message = familyFailureMessage(error, "family_code_issue_failed");
    const databaseCode = error && typeof error === "object" && typeof Reflect.get(error, "code") === "string"
      ? String(Reflect.get(error, "code"))
      : "";
    const { code, status } = classifyFamilyIssueFailure(message, databaseCode);
    const diagnosticCode = `${failureStage}-${databaseCode || "no-code"}`;
    console.error(JSON.stringify({ function: "family-link-issue", code, status, diagnosticCode }));
    return response(origin, { error: code, diagnosticCode }, status);
  }
});
