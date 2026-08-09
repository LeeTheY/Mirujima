import { describe, expect, it } from "vitest";
import { popupPrimaryAction } from "./popup-state";

describe("popup primary action", () => {
  it("sends users without an active session to the Web focus page", () => {
    expect(popupPrimaryAction(false)).toEqual({ label: "웹에서 집중 계획 만들기", path: "/focus" });
  });

  it("keeps active focus control inside the extension", () => {
    expect(popupPrimaryAction(true)).toEqual({ label: "집중 세션 제어", path: null });
  });
});
