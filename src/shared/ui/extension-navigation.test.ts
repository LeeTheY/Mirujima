import { describe, expect, it } from "vitest";
import { EXTENSION_NAV_ITEMS, extensionEntrySurface, webAppUrl } from "./extension-navigation";

describe("extension navigation", () => {
  it("keeps only browser-agent surfaces in the extension", () => {
    expect(EXTENSION_NAV_ITEMS.map((item) => item.id)).toEqual(["focus", "tabs", "web"]);
    expect(extensionEntrySurface(false)).toBe("agent");
    expect(extensionEntrySurface(true)).toBe("agent");
  });

  it("builds exact web routes without accepting wildcard origins", () => {
    expect(webAppUrl("/focus", "http://localhost:3000")).toBe("http://localhost:3000/focus");
    expect(webAppUrl("history", "https://mirujima.vercel.app/")).toBe("https://mirujima.vercel.app/history");
    expect(() => webAppUrl("/focus", "https://*.vercel.app")).toThrow("origin");
  });
});
