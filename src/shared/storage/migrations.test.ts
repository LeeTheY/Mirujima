import { describe, expect, it } from "vitest";
import { migrateSettings } from "./migrations";

describe("storage migration", () => {
  it("빈 저장소에 안전한 기본값을 채운다", () => {
    const settings = migrateSettings({});
    expect(settings.mainUI).toBe("sidepanel");
    expect(settings.schemaVersion).toBe(1);
  });
  it("기존 사용자 설정을 보존한다", () => {
    const settings = migrateSettings({ schemaVersion: 0, settings: { mainUI: "popup", idleThresholdMinutes: 10, notificationsEnabled: false } });
    expect(settings.mainUI).toBe("popup");
    expect(settings.idleThresholdMinutes).toBe(10);
    expect(settings.notificationsEnabled).toBe(false);
  });
});
