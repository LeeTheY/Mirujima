import { describe, expect, it } from "vitest";
import { externalMatchesForMode } from "../../../vite.config";

describe("extension external origins", () => {
  it("keeps production exact", () => {
    expect(externalMatchesForMode("production")).toEqual(["https://mirujima.vercel.app/*"]);
  });

  it("adds localhost only for development builds", () => {
    expect(externalMatchesForMode("development")).toContain("http://localhost:3000/*");
    expect(externalMatchesForMode("production")).not.toContain("http://localhost:3000/*");
  });
});
