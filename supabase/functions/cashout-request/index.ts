import { authenticatedClient, corsHeaders, json } from "../_shared/membership.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    await authenticatedClient(request);
    // No payout provider is contracted. Never reserve or fabricate completion.
    return json({ error: "cashout_unavailable" }, 503);
  } catch {
    return json({ error: "authentication_required" }, 401);
  }
});
