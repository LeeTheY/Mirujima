import { describe, expect, it } from "vitest";
import * as pwa from "./pwa";
import * as manifestModule from "../app/manifest";

describe("PWA configuration", () => {
  it("registers only where service workers are supported", () => {
    const shouldRegister = Reflect.get(pwa, "shouldRegisterServiceWorker") as (input: { secure: boolean; supported: boolean; production: boolean }) => boolean;
    expect(shouldRegister({ secure: true, supported: true, production: true })).toBe(true);
    expect(shouldRegister({ secure: false, supported: true, production: true })).toBe(false);
    expect(shouldRegister({ secure: true, supported: false, production: true })).toBe(false);
    expect(shouldRegister({ secure: true, supported: true, production: false })).toBe(false);
  });

  it("caches only public shell routes and excludes sensitive callbacks", () => {
    expect(pwa.isPublicOfflinePage("/offline")).toBe(true);
    expect(pwa.isPublicOfflinePage("/login")).toBe(false);
    expect(pwa.isSensitivePwaRequest("/wallet/charge/success?paymentKey=p&orderId=o&amount=10000")).toBe(true);
    expect(pwa.isSensitivePwaRequest("/auth/callback?code=secret")).toBe(true);
    expect(pwa.isSensitivePwaRequest("/how")).toBe(false);
    expect(pwa.isSensitivePwaRequest("https://example.com/api")).toBe(true);
  });

  it("provides standalone metadata and install icons", () => {
    const manifest = (Reflect.get(manifestModule, "default") as () => {
      name: string;
      display: string;
      icons: Array<{ sizes: string }>;
    })();
    expect(manifest.name).toBe("미루지마 Mirujima");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(["192x192", "512x512"]);
  });
});
