import { notificationPageSchema } from "@mirujima/contracts";
import { membershipSupabaseClient } from "../features/membership/service";
import { MEMBERSHIP_PRODUCT } from "../features/membership/product-config";
import { repository } from "../shared/storage/repository";

let pending: Promise<void> | null = null;
export function syncServerNotifications(): Promise<void> {
  if (pending) return pending;
  pending = sync().finally(() => { pending = null; });
  return pending;
}
async function sync(): Promise<void> {
  if (!MEMBERSHIP_PRODUCT.supabaseUrl || !MEMBERSHIP_PRODUCT.supabasePublishableKey) return;
  const client = membershipSupabaseClient();
  const auth = await client.auth.getUser();
  if (auth.error || !auth.data.user) return;
  const settings = await repository.getSettings();
  if (!settings.notificationsEnabled) return;
  const response = await client.rpc("list_notifications", { p_limit: 50, p_before_created_at: null, p_before_id: null });
  const parsed = notificationPageSchema.safeParse(response.data);
  if (response.error || !parsed.success) return;
  const storageKey = "mirujima:server-notification-delivery";
  const stored: unknown = (await chrome.storage.local.get(storageKey))[storageKey];
  const cache = stored && typeof stored === "object" ? stored as { ownerId?: unknown; ids?: unknown } : null;
  const seen: string[] = cache?.ownerId === auth.data.user.id && Array.isArray(cache.ids) ? cache.ids.filter((id): id is string => typeof id === "string") : [];
  for (const item of parsed.data.items.filter((item) => !item.readAt && Date.now() - Date.parse(item.createdAt) < 86_400_000)) {
    if (seen.includes(item.id)) continue;
    await chrome.notifications.create(`mirujima:server:${item.id}`, {
      type: "basic", iconUrl: chrome.runtime.getURL("icons/icon-128.png"), title: "미루지마",
      message: "새 알림이 도착했습니다. 앱에서 확인해 주세요.",
    });
    seen.push(item.id);
    await chrome.storage.local.set({ [storageKey]: { ownerId: auth.data.user.id, ids: seen.slice(-500) } });
  }
}
export function serverNotificationDestination(id: string): string | null {
  if (!/^mirujima:server:[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const url = new URL(MEMBERSHIP_PRODUCT.webAppOrigin);
    return url.protocol === "https:" || ["localhost", "127.0.0.1"].includes(url.hostname) ? `${url.origin}/login?next=/home` : null;
  } catch { return null; }
}
