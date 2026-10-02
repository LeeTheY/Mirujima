import { describe, expect, it, vi } from "vitest";
import { operationResponder } from "./operation-response";
describe("safe correlation", () => {
  it("keeps the response contract, exposes a request id and logs no raw payload", async () => {
    const logger = vi.fn(); const respond = operationResponder("refund", (body, status) => Response.json(body, { status }), logger);
    const response = respond({ error: "refund_result_unconfirmed", private: "secret-url" }, 502);
    expect(response.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(await response.json()).toEqual({ error: "refund_result_unconfirmed", private: "secret-url" });
    expect(JSON.parse(logger.mock.calls[0][0])).toMatchObject({ event: "operation_failed", status: 502, operation: "refund" });
    expect(logger.mock.calls[0][0]).not.toContain("secret-url");
  });
});
