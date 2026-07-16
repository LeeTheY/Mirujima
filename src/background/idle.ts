import { showNotification } from "./notifications";
import { repository } from "../shared/storage/repository";
import { createId } from "../shared/utils/id";

export function registerIdleListener(): void {
  chrome.idle.onStateChanged.addListener((state) => {
    void (async () => {
      const session = await repository.getActiveSession();
      if (!session || session.status !== "active") return;
      const type = state === "active" ? "idle-end" : "idle-start";
      let nextSession = session;
      if (state === "active") {
        const events = await repository.getEvents();
        const started = events.filter((item) => item.sessionId === session.id && item.type === "idle-start").at(-1);
        if (started) {
          const idleSeconds = Math.max(0, Math.floor((Date.now() - new Date(started.occurredAt).getTime()) / 1000));
          nextSession = { ...session, idleSeconds: session.idleSeconds + idleSeconds };
          await repository.setActiveSession(nextSession);
        }
      }
      await repository.appendEvent({
        id: createId("event"), scheduleId: session.scheduleId, sessionId: session.id,
        type, occurredAt: new Date().toISOString()
      });
      if (state !== "active") {
        await repository.setActiveSession({ ...nextSession, checkInCount: nextSession.checkInCount + 1 });
        await showNotification("idle-check", session.id, "자리 비움이 감지됐습니다", "설정한 시간 동안 키보드·마우스 입력이 없거나 화면이 잠겼어요. 계속 집중 중인지 확인해 주세요.", ["계속 집중", "일시정지"]);
      }
    })();
  });
}
