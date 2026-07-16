import type { ExtensionMessage } from "../shared/types/messages";

const HEARTBEAT_INTERVAL_MS = 60_000;

export function isExtensionContextInvalidatedError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes("extension context invalidated");
}

export function startActivityHeartbeat(): () => void {
  let lastActivityAt = Date.now();
  let lastSentAt = 0;
  let stopped = false;
  let timer: number | null = null;
  const noteActivity = () => { lastActivityAt = Date.now(); };
  const events: (keyof DocumentEventMap)[] = ["click", "keydown", "scroll", "pointermove"];
  events.forEach((event) => document.addEventListener(event, noteActivity, { passive: true }));

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) window.clearInterval(timer);
    events.forEach((event) => document.removeEventListener(event, noteActivity));
    document.removeEventListener("visibilitychange", send);
  };

  const send = () => {
    if (stopped) return;
    if (Date.now() - lastActivityAt > HEARTBEAT_INTERVAL_MS * 2 || Date.now() - lastSentAt < HEARTBEAT_INTERVAL_MS) return;
    const message: ExtensionMessage = {
      type: "ACTIVITY_HEARTBEAT",
      occurredAt: new Date(lastActivityAt).toISOString(),
      visible: document.visibilityState === "visible"
    };
    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.id) {
        stop();
        return;
      }
      lastSentAt = Date.now();
      void chrome.runtime.sendMessage(message).catch((error: unknown) => {
        if (isExtensionContextInvalidatedError(error)) stop();
      });
    } catch (error) {
      if (isExtensionContextInvalidatedError(error) || typeof chrome === "undefined" || !chrome.runtime?.id) stop();
    }
  };
  timer = window.setInterval(send, HEARTBEAT_INTERVAL_MS);
  document.addEventListener("visibilitychange", send);
  send();
  return stop;
}
