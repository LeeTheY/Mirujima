import { authenticatedClient, corsHeaders, json, membershipResponse, registerDevice } from "../_shared/membership.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await request.json().catch(() => ({}));
    const { client, user } = await authenticatedClient(request);
    await registerDevice(client, user.id, body);
    return json(await membershipResponse(client, user.id));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "membership_lookup_failed" }, 401);
  }
});
