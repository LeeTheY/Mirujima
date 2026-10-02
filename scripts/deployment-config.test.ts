import { describe, expect, it } from "vitest";
import { inspectDeploymentConfig, localRestoreConfig } from "./deployment-config.mjs";

const env = {
  NEXT_PUBLIC_APP_ORIGIN: "https://mirujima.vercel.app",
  VITE_WEB_APP_ORIGIN: "https://mirujima.vercel.app",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID: "a".repeat(32),
  NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_ck_fixture",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "a".repeat(87),
};
const manifest = { manifest_version: 3, externally_connectable: { matches: [`${env.NEXT_PUBLIC_APP_ORIGIN}/*`] } };
describe("deployment configuration boundary", () => {
  it("accepts aligned test configuration without exposing values", () => {
    const result = inspectDeploymentConfig(env, manifest);
    expect(result.every((check) => check.passed)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("fixture");
  });
  it.each(["http://localhost:3000", "https://user:pass@example.com", "https://example.com/path", "https://example.com?key=x"])("rejects unsafe deployment origin %s", (value) => {
    expect(inspectDeploymentConfig({ ...env, NEXT_PUBLIC_APP_ORIGIN: value }, manifest)[0].passed).toBe(false);
  });
  it("rejects wildcard external messaging", () => {
    expect(inspectDeploymentConfig(env, { ...manifest, externally_connectable: { matches: ["https://*.vercel.app/*"] } })[2].passed).toBe(false);
  });
  it("rejects widget keys when the checkout uses the payment window SDK", () => {
    expect(inspectDeploymentConfig({ ...env, NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_gck_fixture" }, manifest)
      .find((check) => check.name === "tossModeAndClientKey")?.passed).toBe(false);
  });
  it("rejects placeholder keys and live Toss", () => {
    const result = inspectDeploymentConfig({ ...env, NEXT_PUBLIC_TOSS_CLIENT_KEY: "live_ck_fixture", NEXT_PUBLIC_VAPID_PUBLIC_KEY: "", NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID: "" }, manifest);
    expect(result.filter((check) => !check.passed).map((check) => check.name)).toEqual(["publishedExtensionId", "tossModeAndClientKey", "publicVapidKey"]);
  });
  it("rejects backend and extension mismatches", () => {
    const result = inspectDeploymentConfig({ ...env, VITE_SUPABASE_URL: "https://other.supabase.co", VITE_WEB_APP_ORIGIN: "https://other.vercel.app" }, manifest);
    expect(result.find((check) => check.name === "sameSupabaseProject")?.passed).toBe(false);
    expect(result.find((check) => check.name === "extensionSameOrigin")?.passed).toBe(false);
  });
});
describe("local restore guard", () => {
  const config = { PGHOST: "127.0.0.1", PGPORT: "55439", PGDATABASE: "postgres", PGUSER: "postgres" };
  it("accepts explicit loopback configuration", () => expect(localRestoreConfig(config).database).toBe("postgres"));
  it.each([
    { PGHOST: "remote.supabase.co" }, { PGHOST: "/tmp" }, { PGDATABASE: "postgres://remote/db" },
    { PGPORT: "0" }, { PGPORT: "65536" }, { PGSERVICE: "remote" }, { PGSERVICEFILE: "/tmp/service" }, { PGHOSTADDR: "203.0.113.1" },
  ])("rejects implicit or remote connection overrides %j", (override) => expect(() => localRestoreConfig({ ...config, ...override })).toThrow());
});
