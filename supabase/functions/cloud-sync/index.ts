import { assertEntitlement, authenticatedClient, corsHeaders, json, registerDevice } from "../_shared/membership.ts";

type EntityType = "schedule" | "settings" | "focus-session" | "report" | "learning-day";

interface MutationInput {
  mutationId: string;
  entityType: EntityType;
  entityId: string;
  operation: "upsert" | "delete";
  expectedVersion: number;
  payload: Record<string, unknown> | null;
  deviceId: string;
}

function validMutation(value: unknown): value is MutationInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<MutationInput>;
  return typeof input.mutationId === "string" && typeof input.entityId === "string" && typeof input.deviceId === "string"
    && typeof input.expectedVersion === "number" && input.expectedVersion >= 0
    && ["schedule", "settings", "focus-session", "report", "learning-day"].includes(input.entityType ?? "")
    && (input.operation === "upsert" || input.operation === "delete")
    && (input.payload === null || (typeof input.payload === "object" && !Array.isArray(input.payload)));
}

function cloudRecord(entityType: EntityType, row: Record<string, unknown>) {
  const entityId = entityType === "learning-day" ? row.date_key : row.entity_id;
  return {
    entityType,
    entityId,
    payload: row.payload,
    version: row.version,
    deviceId: row.device_id,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body: Record<string, unknown> = await request.json();
    const { client, admin, user } = await authenticatedClient(request);
    await assertEntitlement(client, user.id, "cloud-sync");
    await registerDevice(client, user.id, body);
    await admin.rpc("prune_cloud_history");

    if (body.action === "push") {
      if (!Array.isArray(body.mutations) || body.mutations.length > 100 || JSON.stringify(body.mutations).length > 1_000_000) {
        return json({ error: "invalid_mutation_batch" }, 400);
      }
      const results: unknown[] = [];
      for (const candidate of body.mutations) {
        if (!validMutation(candidate)) return json({ error: "invalid_mutation" }, 400);
        const { data, error } = await client.rpc("apply_cloud_mutation", {
          p_mutation_id: candidate.mutationId,
          p_entity_type: candidate.entityType,
          p_entity_id: candidate.entityId,
          p_operation: candidate.operation,
          p_expected_version: candidate.expectedVersion,
          p_payload: candidate.payload,
          p_device_id: candidate.deviceId
        });
        if (error) throw error;
        results.push(data);
      }
      return json({ results });
    }

    if (body.action === "pull") {
      const [schedules, settings, sessions, reports, learningDays] = await Promise.all([
        client.from("cloud_schedules").select("entity_id,payload,version,device_id,updated_at,deleted_at"),
        client.from("cloud_settings").select("entity_id,payload,version,device_id,updated_at,deleted_at"),
        client.from("cloud_focus_sessions").select("entity_id,payload,version,device_id,updated_at,deleted_at"),
        client.from("cloud_reports").select("entity_id,payload,version,device_id,updated_at,deleted_at"),
        client.from("cloud_learning_days").select("date_key,payload,version,device_id,updated_at,deleted_at").gte("date_key", new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10))
      ]);
      const failed = [schedules, settings, sessions, reports, learningDays].find((result) => result.error);
      if (failed?.error) throw failed.error;
      return json({ records: [
        ...(schedules.data ?? []).map((row) => cloudRecord("schedule", row)),
        ...(settings.data ?? []).map((row) => cloudRecord("settings", row)),
        ...(sessions.data ?? []).map((row) => cloudRecord("focus-session", row)),
        ...(reports.data ?? []).map((row) => cloudRecord("report", row)),
        ...(learningDays.data ?? []).map((row) => cloudRecord("learning-day", row))
      ] });
    }
    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "cloud_sync_failed" }, 401);
  }
});
