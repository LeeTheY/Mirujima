import { describe, expect, it } from "vitest";
import * as pwa from "./pwa";
import * as manifestModule from "../app/manifest";

describe("PWA configuration", () => {
  it("registers only where service workers are supported", () => {
    const shouldRegister = Reflect.get(pwa, "shouldRegisterServiceWorker") as (input: { secure: boolean; supported: boolean }) => boolean;
    expect(shouldRegister({ secure: true, supported: true })).toBe(true);
    expect(shouldRegister({ secure: false, supported: true })).toBe(false);
    expect(shouldRegister({ secure: true, supported: false })).toBe(false);
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
