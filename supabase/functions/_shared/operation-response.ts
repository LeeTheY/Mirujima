type Responder = (body: unknown, status?: number) => Response;
export function operationResponder(operation: string, respond: Responder, logger: (entry: string) => void = console.info): Responder {
  const requestId = crypto.randomUUID();
  return (body, status = 200) => {
    if (status >= 400) logger(JSON.stringify({ event: "operation_failed", operation, requestId, status }));
    const response = respond(body, status);
    response.headers.set("X-Request-Id", requestId);
    response.headers.set("Access-Control-Expose-Headers", "X-Request-Id");
    return response;
  };
}
