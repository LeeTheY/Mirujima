import { NOTIFICATION_COOLDOWN_MS } from "../shared/constants";
import { repository } from "../shared/storage/repository";
import type { NotificationKind } from "../shared/types/models";

export function isNotificationInCooldown(previousSentAt: string | undefined, now = Date.now()): boolean {
  return Boolean(previousSentAt && now - new Date(previousSentAt).getTime() < NOTIFICATION_COOLDOWN_MS);
}

export function shouldSkipNotification(previousSentAt: string | undefined, bypassCooldown = false, now = Date.now()): boolean {
  return !bypassCooldown && isNotificationInCooldown(previousSentAt, now);
}

interface NotificationOptions {
  bypassCooldown?: boolean;
  replaceExisting?: boolean;
}

const TEST_NOTIFICATION_PREFIX = "focus-check:test:";

export function isTestNotificationId(id: string): boolean {
  return id.startsWith(TEST_NOTIFICATION_PREFIX);
}

export async function showNotification(
  kind: NotificationKind,
  entityId: string,
  title: string,
  message: string,
  buttons?: [string, string?],
  options: NotificationOptions = {}
): Promise<boolean> {
  const settings = await repository.getSettings();
  const id = `${kind}:${entityId}`;
  const state = await repository.getNotificationState();
  const previous = state[id];
  if (shouldSkipNotification(previous?.sentAt, options.bypassCooldown)) return false;
  state[id] = { id, sentAt: new Date().toISOString(), handled: false, title, message };
  await repository.setNotificationState(state);
  await chrome.action.setBadgeBackgroundColor({ color: "#E45A3B" });
  await chrome.action.setBadgeText({ text: "!" });
  if (settings.notificationsEnabled) {
    try {
      if (options.replaceExisting) await chrome.notifications.clear(id);
      await chrome.notifications.create(id, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
        title,
        message,
        priority: 2,
        buttons: buttons?.filter((label): label is string => Boolean(label)).map((label) => ({ title: label }))
      });
    } catch (error) {
      console.warn("미루지마 시스템 알림을 표시하지 못했습니다.", error);
      state[id] = { ...state[id], message: `${message} (시스템 알림 표시 실패)` };
      await repository.setNotificationState(state);
    }
  }
  return true;
}

export async function markNotificationHandled(id: string): Promise<void> {
  const state = await repository.getNotificationState();
  if (state[id]) state[id] = { ...state[id], handled: true };
  await repository.setNotificationState(state);
  if (Object.values(state).every((item) => item.handled)) await chrome.action.setBadgeText({ text: "" });
}

export async function showTestNotification(): Promise<boolean> {
  const visibleNotifications = await chrome.notifications.getAll();
  await Promise.all(Object.keys(visibleNotifications).filter(isTestNotificationId).map((id) => chrome.notifications.clear(id)));

  const state = await repository.getNotificationState();
  const cleanedState = Object.fromEntries(Object.entries(state).filter(([id]) => !isTestNotificationId(id)));
  await repository.setNotificationState(cleanedState);

  return showNotification(
    "focus-check",
    `test:${crypto.randomUUID()}`,
    "미루지마 알림 테스트",
    "이 알림이 보이면 준비가 완료됐어요.",
    undefined,
    { bypassCooldown: true }
  );
}
