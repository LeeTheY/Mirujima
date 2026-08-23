export function canonicalSessionIdFromRealtimePayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const next = Reflect.get(payload, "new");
  const previous = Reflect.get(payload, "old");
  const row = next && typeof next === "object" ? next : previous;
  if (!row || typeof row !== "object") return null;
  const entityId = Reflect.get(row, "entity_id");
  return typeof entityId === "string" && entityId.length > 0 && entityId.length <= 300
    ? entityId
    : null;
}
