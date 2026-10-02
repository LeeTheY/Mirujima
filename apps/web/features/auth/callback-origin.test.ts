import { describe, expect, it } from "vitest";
import { callbackOrigin } from "./callback-origin";
describe("OAuth canonical origin", () => {
  it("uses configured origin when Next normalizes the local request host", () => expect(callbackOrigin("http://127.0.0.1:3110", "http://localhost:3110")).toBe("http://127.0.0.1:3110"));
  it("uses a secure request origin only when config is absent", () => expect(callbackOrigin(undefined, "https://mirujima.vercel.app")).toBe("https://mirujima.vercel.app"));
  it("rejects credentials, paths and insecure remote origins", () => { for (const value of ["http://remote.test", "https://user:secret@remote.test", "https://remote.test/x", "https://remote.test?token=x"]) expect(() => callbackOrigin(value, "https://mirujima.vercel.app")).toThrow(); });
});
