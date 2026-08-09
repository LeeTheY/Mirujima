import { describe, expect, it } from "vitest";
import { allowedOrigin } from "./origin";

describe("allowedOrigin", () => {
  const configured = "https://mirujima.vercel.app,http://localhost:3000";

  it("allows only configured exact origins", () => {
    expect(allowedOrigin("https://mirujima.vercel.app", configured)).toBe("https://mirujima.vercel.app");
    expect(allowedOrigin("http://localhost:3000", configured)).toBe("http://localhost:3000");
    expect(allowedOrigin("https://preview.vercel.app", configured)).toBeNull();
    expect(allowedOrigin("https://mirujima.vercel.app.evil.test", configured)).toBeNull();
  });
});
