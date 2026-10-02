import { describe, expect, it } from "vitest";
import { canonicalSessionIdFromRealtimePayload } from "./canonical-focus-realtime";

describe("canonical focus realtime invalidation", () => {
  it("extracts only a bounded session id from new or old rows", () => {
    expect(canonicalSessionIdFromRealtimePayload({ new: { entity_id: "session-1", payload: { status: "failed" } } }))
      .toBe("session-1");
    expect(canonicalSessionIdFromRealtimePayload({ new: {}, old: { entity_id: "session-2" } }))
      .toBeNull();
    expect(canonicalSessionIdFromRealtimePayload({ old: { entity_id: "session-2" } }))
      .toBe("session-2");
    expect(canonicalSessionIdFromRealtimePayload({ new: { entity_id: "x".repeat(301) } })).toBeNull();
  });
});
