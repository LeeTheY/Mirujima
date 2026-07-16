import { describe, expect, it } from "vitest";
import { migrateTabOrganizerSettings } from "./repository";

describe("탭 그룹화 설정 migration", () => {
  it("기존 사용자에게 안전한 기본값을 추가한다", () => {
    const settings = migrateTabOrganizerSettings(undefined);
    expect(settings.enabled).toBe(true);
    expect(settings.preserveUserGroups).toBe(true);
    expect(settings.includePinnedTabs).toBe(false);
    expect(settings.restoreLayoutOnFinish).toBe("ask");
  });
  it("사용자가 저장한 옵션을 보존한다", () => {
    const settings = migrateTabOrganizerSettings({ enabled: false, organizeOnFocusStart: false });
    expect(settings.enabled).toBe(false);
    expect(settings.organizeOnFocusStart).toBe(false);
    expect(settings.organizeOnFocusResume).toBe(true);
  });
});
