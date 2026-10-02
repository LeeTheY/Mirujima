import { describe, expect, it } from "vitest";
import { extensionWebOriginForMode, externalMatchesForMode } from "../../../vite.config";

describe("extension external origins", () => {
  it("keeps production exact", () => {
    expect(externalMatchesForMode("production")).toEqual(["https://mirujima.vercel.app/*"]);
  });

  it("adds localhost only for development builds", () => {
    expect(externalMatchesForMode("development")).toContain("http://localhost:3000/*");
    expect(externalMatchesForMode("production")).not.toContain("http://localhost:3000/*");
  });
});

it("aligns production runtime origin with its manifest even when local env points to localhost", () => {
  expect(extensionWebOriginForMode("production", "http://localhost:3000")).toBe("https://mirujima.vercel.app");
  expect(extensionWebOriginForMode("development", "http://localhost:3000")).toBe("http://localhost:3000");
  expect(() => extensionWebOriginForMode("development", "https://evil.test")).toThrow("origin");
});
